let downloadQueue = [];
let downloadRunning = false;
const maxDownloadTries = 5;
const error404Regex = /.\w+$/
const errorFileExtensions = [".html", ".htm"];
const { storage } = browser;
const { session } = browser.storage;
const browserStorage = browser.storage.local;

let settingsDefaults = {
    restoreThumbnailsFF: { value: true, pc: true, mobile: true, description: "Restore post thumbnails", explanation: 'Restores thumbnails of posts when no thumbnail exists. If the post contains no images, the content of the post itself is displayed instead.' },
    readPostsFF: { value: true, pc: true, mobile: true, description: "Mark visited posts", explanation: 'Add a "read" badge to visited posts.' },
    downloaderFF: { value: true, pc: true, mobile: true, description: "Image downloader", explanation: 'Add a download button to the corner of images.' },
    unreadDotFF: { value: true, pc: true, mobile: true, description: "Unread markers in favorites", explanation: 'Highlight users with new posts in your favorites.' },
    subscriptionsFF: { value: true, pc: true, mobile: false, description: "Subscriptions", explanation: 'Enables the subscription system. this adds a "subscribe" button to user pages. It also allows the extension to check for new posts in the background and to notify you of them with system notifications.' },
    wheelTiltFF: { value: true, pc: true, mobile: false, description: "Mouse wheel navigation", explanation: 'Use tilting of the mouse wheel for navigation.' },
    swipeNavigationFF: { value: true, pc: false, mobile: true, description: "Swipe navigation", explanation: 'Allows navigation with swipe gestures.' }
}

let syncStorage = {};
FetchDB();

CheckSubscribed()
setInterval(() => {
    CheckSubscribed()
}, 1800000) // repeat every half hour

browser.webRequest.onBeforeRequest.addListener(
    function (details) {
        console.log("refresh")
        if (details.tabId >= 0) {
            browser.tabs.sendMessage(details.tabId, { type: "refresh" });
        }
    },
    { urls: ["https://cdn.tsyndicate.com/sdk/v1/p.js"] }, // this is the trigger to load the content script
    ["blocking"]
);


function CheckSubscribed() {
    FetchDB().then(() => {
        if (!syncStorage.settings.subscriptionsFF.value) {
            return
        }
        console.log("checking for new posts...");
        if (Object.keys(syncStorage.subscribed).length > 0) {
            let subscribedIndex = 0;
            let subscribedKeys = Object.keys(syncStorage.subscribed)
            let interval2 = setInterval(() => {
                if (subscribedKeys.length <= subscribedIndex) {
                    clearInterval(interval2)
                } else {
                    const userID = subscribedKeys[subscribedIndex];
                    const apiURL = "https://" + syncStorage.subscribed[userID].site + ".su/api/v1/" +
                        syncStorage.subscribed[userID].service + "/user/" +
                        subscribedKeys[subscribedIndex];
                    SendRequest(apiURL, 600).then((data) => {
                        let request = JSON.parse(data);
                        if (request != null) {
                            if (syncStorage.subscribed[userID].lastPost != request[0].added) {
                                let unreadPosts = 0;
                                for (let i = 0; i < request.length; i++) {
                                    if (request[i].added != syncStorage.subscribed[userID].lastPost) {
                                        unreadPosts++;
                                    }
                                    else { break; }
                                }
                                request = request.splice(0, unreadPosts);

                                syncStorage.subscribed[userID].lastPost = request[0].added;
                                SetDB()

                                let postTitles = request.slice(0, request.length == 50 ? Math.min(3, request.length) : 4).map(element => element.title);

                                let notification = browser.notifications.create({
                                    type: 'basic',
                                    iconUrl: `https://img.${syncStorage.subscribed[userID].site}.su/icons/${syncStorage.subscribed[userID].service}/${userID}`, // URL to the icon to display
                                    title: `${unreadPosts + (unreadPosts == 50 ? "+" : "")} new post${unreadPosts > 1 ? 's' : ''} by ${syncStorage.subscribed[userID].creatorName}`,
                                    message: postTitles.join('\n') + (request.length > 3 ? ('...\nand ' + (request.length - 3) + (request.length == 50 ? '+' : '') + ' more') : ''),
                                });
                                notification.then((id) => {
                                    browser.notifications.onClicked.addListener((clickedID) => {
                                        if (clickedID == id) {
                                            browser.tabs.create({ url: `https://${syncStorage.subscribed[userID].site}.su/${syncStorage.subscribed[userID].service}/user/${userID}` });
                                        }
                                    })
                                })
                            }
                            subscribedIndex++;
                        }
                    })
                }
            }, 1000)
        }
    })
}

function Download(tries = 0) {
    if (downloadQueue.length > 0) {
        console.log("starting download", downloadQueue[0], downloadQueue)
        downloadRunning = true
        let url = downloadQueue[0].url
        let downloadQueueItem = downloadQueue[0]
        return new Promise((resolve, reject) => {
            if (url == undefined || errorFileExtensions.includes(url.match(error404Regex)[0])) {
                if (downloadQueue.length > 0) {
                    downloadQueue.splice(0, 1);
                    Download()
                }
                downloadRunning = false
                reject("problem with url: " + url);
            }
            let downloadStartStatus = browser.downloads.download({ url: url })
            downloadStartStatus.then((downloadID /*ID of the created download item*/) => {

                let lastPercentage = 0;
                let interval = setInterval(() => { // for regularly checking download progress and sending it to the content script
                    browser.downloads.search({ state: "in_progress", id: downloadID }).then((downloadItems /*found actual download item*/) => {
                        if (downloadItems.length <= 0) {
                            clearInterval(interval);
                        } else {
                            let percentage = Math.round(downloadItems[0].bytesReceived / downloadItems[0].totalBytes * 100);
                            if (percentage != lastPercentage) {
                                lastPercentage = percentage
                                browser.tabs.query({ url: "*://*.kemono.su/*" || "*://*.coomer.su/*" }).then((tabs) => {
                                    if (downloadQueue.length > 0) {
                                        tabs.forEach((tab) => {
                                            browser.tabs.sendMessage(tab.id, { type: "DownloadProgress", status: "downloading", progress: percentage, url: url });
                                        });
                                    }
                                });
                            }
                        }
                    })
                }, 500);

                browser.downloads.onChanged.addListener(((downloadItem) => { // for when the download is finished
                    console.log(downloadItem)
                    if (downloadItem.id == downloadID) {
                        if (downloadItem.hasOwnProperty("state") && downloadItem.state.current == "complete") { // download has finished
                            console.log("download finished " + url)
                            console.log(downloadQueueItem, downloadQueueItem.DBPath)
                            if (!syncStorage.hasOwnProperty("postDB")) {
                                syncStorage.postDB = {};
                            }
                            if (!syncStorage.postDB.hasOwnProperty(downloadQueueItem.DBPath.userID)) {
                                syncStorage.postDB[downloadQueueItem.DBPath.userID] = {};
                            }
                            if (!syncStorage.postDB[downloadQueueItem.DBPath.userID].hasOwnProperty(downloadQueueItem.DBPath.postID)) {
                                syncStorage.postDB[downloadQueueItem.DBPath.userID][downloadQueueItem.DBPath.postID] = {};
                            }
                            syncStorage.postDB[downloadQueueItem.DBPath.userID][downloadQueueItem.DBPath.postID][downloadQueueItem.DBPath.imageID] = Date.now();
                            browserStorage.set(syncStorage);

                            chrome.tabs.query({ url: "*://*.kemono.su/*" || "*://*.coomer.su/*" }, (tabs) => {
                                for (let i = 0; i < tabs.length; i++) {
                                    chrome.tabs.sendMessage(tabs[i].id, { type: "DownloadProgress", status: "download-complete", url: url });
                                };
                                if (downloadQueue.length > 0) {
                                    downloadQueue.splice(0, 1);
                                    Download()
                                }
                                downloadRunning = false
                                resolve()
                            })
                        }
                        else if (downloadItem.hasOwnProperty("error") && downloadItem.error != "") { // download was interrupted
                            browser.downloads.search({ id: downloadID }).then((downloadItems) => {
                                if (downloadItems[0].error != "USER_CANCELED" && downloadItems[0] != "CRASH") { // cancellation reason was NOT a crash or user cancellation
                                    if ((tries + 1) > maxDownloadTries) {
                                        tries = -1;
                                        downloadQueue.splice(0, 1);
                                    }
                                    setTimeout(() => {
                                        if (downloadQueue.length > 0) {
                                            console.warn("download failed. tries: " + tries, downloadItem)
                                            Download(tries + 1)
                                        }
                                        downloadRunning = false
                                        resolve()
                                    }, 1000 * tries);
                                }
                                else {
                                    console.log(downloadQueue)
                                    downloadQueue.splice(0, 1);
                                    console.log(downloadQueue)
                                    if (downloadQueue.length > 0) {
                                        Download()
                                    }
                                    downloadRunning = false
                                    resolve()
                                }
                            })
                        }
                    }
                }))
            })
        })
    } else {
        downloadRunning = false
    }
}

function QueDownload(url, DBPath) {
    downloadQueue.push({ url: url, DBPath: DBPath })
    if (!downloadRunning) {
        Download()
    }
}

function CancelDownload(url) {
    let downloadQueueIndex = downloadQueue.findIndex(element => element.url == url)
    if (downloadQueueIndex > 0) {
        console.log(downloadQueue)
        downloadQueue.splice(downloadQueueIndex, 1)
    }
    browser.downloads.search({ state: "in_progress", url: url }).then((downloadItems /*found actual download item*/) => {
        downloadItems.forEach(downloadItem => {
            browser.downloads.cancel(downloadItem.id)
        })
    })
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type == "download") {
        if (downloadQueue.find(((element) => element.url == message.url)) == undefined) {
            QueDownload(message.url, message.DBPath)
        }

    } else if (message.type == "download cancel") {
        CancelDownload(message.url)

    } else if (message.type == "DBUpdate") {
        browser.tabs.query({ url: "*://*.kemono.su/*" || "*://*.coomer.su/*" }).then((tabs) => {
            tabs.forEach((tab) => {
                browser.tabs.sendMessage(tab.id, { type: "DBUpdate" });
            });
        });
    } else if (message.type == "ping") {
        sendResponse(true)
    }
});

function SyncObjects(oldObject, newObject) {
    const result = structuredClone(newObject); // Clone obj2 to avoid mutating it

    function mergeObjects(source, target) {
        for (const key in source) {
            if (typeof source[key] === "object" && !Array.isArray(source[key]) && source[key] !== null) {
                // If the key exists in target and both are objects, merge them recursively
                if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
                    target[key] = {};
                }
                mergeObjects(source[key], target[key]);
            } else {
                // Otherwise, add the value from source if it's not in target
                if (!(key in target)) {
                    target[key] = source[key];
                }
            }
        }
    }

    mergeObjects(oldObject, result);

    return result;
}

function FetchDB() {
    return new Promise((resolve) => {
        browserStorage.get().then((data) => {
            syncStorage = data;
            if (
                !syncStorage.hasOwnProperty("postDB") ||
                syncStorage.postDB == undefined
            ) {
                syncStorage.postDB = {};
            }
            if (!syncStorage.hasOwnProperty("settings")) {
                syncStorage.settings = settingsDefaults
            }
            else {
                Object.keys(settingsDefaults).map((key) => {
                    if (!syncStorage.settings.hasOwnProperty(key)) {
                        syncStorage.settings[key] = settingsDefaults[key];
                    }
                });
            }
            if (!syncStorage.hasOwnProperty("subscribed")) {
                syncStorage.subscribed = {};
            }
            if (!syncStorage.hasOwnProperty("lastDBUpdate")) {
                syncStorage.lastDBUpdate = -1;
            }
            console.log(syncStorage)
            SetDB();
            resolve();
        })
    })
}

function SetDB() {
    browserStorage.get().then((data) => {
        console.log("setting DB", data, syncStorage)
        syncStorage.lastDBUpdate = Date.now();
        browserStorage.set(syncStorage);
    })
}

function SendRequest(url) {
    return new Promise((resolve, reject) => {
        console.log("Sending request to " + url);
        let before = Date.now();
        fetch(url).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            console.log("request to " + url + " took " + (Date.now() - before) / 1000 + " seconds")
            resolve(response.text());
        })
            .catch(error => {
                // Handle errors
                console.error('Error fetching HTML:', error);
                reject(null);
            });
    })
}
