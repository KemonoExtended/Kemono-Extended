let downloadQueue = [];
let downloadRunning = false;
const maxDownloadTries = 5
const error404Regex = /.\w+$/
const errorFileExtensions = [".html", ".htm"];
const { storage } = browser;
const { session } = browser.storage;
const browserStorage = browser.storage.local;

let settingsDefaults = {
    wheelTiltFF: { value: true, pc: true, mobile: false, description: "Mouse wheel navigation", explanation: 'Use tilting of the mouse wheel for navigation.' },
    readPostsFF: { value: true, pc: true, mobile: true, description: "Mark visited posts", explanation: 'Add a "read" badge to visited posts.' },
    readAllFF: { value: true, pc: true, mobile: true, description: "Read all button", explanation: 'Add a "read all" button to mark all posts as "seen".' },
    downloaderFF: { value: true, pc: true, mobile: true, description: "Image downloader", explanation: 'Add a download button to the corner of images.' },
    unreadDotFF: { value: true, pc: true, mobile: true, description: "Unread dots in favorites", explanation: 'Highlight users whith new posts in your favorites.' },
    restoreThumbnailsFF: { value: true, pc: true, mobile: true, description: "Restore post thumbnails", explanation: 'Restores thumbnails of posts when no thumbnail exists. If the post contains no images, the content of the post itself is displayed instead.' },
    subscriptionsFF: { value: true, pc: true, mobile: false, description: "Add Subscriptions", explanation: 'Enables the subscription system. this adds a "subscribe" button to user pages. It also allows the extension to check for new posts in the background and to notify you of them.' },
    swipeNavigationFF: { value: true, pc: false, mobile: true, description: "Swipe navigation", explanation: 'Allows navigation with swipe gestures.' },
}

let syncStorage = {};
FetchDB();
CheckWatched()

function CheckWatched() {
    setInterval(() => {
        FetchDB().then(() => {
            if (!syncStorage.settings.subscriptionsFF.value) {
                return
            }
            if (Object.keys(syncStorage.watched).length > 0) {
                let watchedIndex = 0;
                let watchedKeys = Object.keys(syncStorage.watched)
                let interval2 = setInterval(() => {
                    if (watchedKeys.length <= watchedIndex) {
                        clearInterval(interval2)
                    } else {
                        const userID = watchedKeys[watchedIndex];
                        const apiURL = "https://" + syncStorage.watched[userID].site + ".su/api/v1/" +
                            syncStorage.watched[userID].service + "/user/" +
                            watchedKeys[watchedIndex];
                        SendRequest(apiURL).then((data) => {
                            let request = JSON.parse(data);
                            if (request != null) {
                                if (syncStorage.watched[userID].lastPost != request[0].added) {
                                    let unreadPosts = 0;
                                    for (let i = 0; i < request.length; i++) {
                                        if (request[i].added != syncStorage.watched[userID].lastPost) {
                                            unreadPosts++;
                                        }
                                        else { break; }
                                    }
                                    request = request.splice(0, unreadPosts);

                                    let postTitles = request.slice(0, request.length == 50 ? Math.min(3, request.length) : 4).map(element => element.title);

                                    let notification = browser.notifications.create({
                                        type: 'basic',
                                        iconUrl: `https://img.${syncStorage.watched[userID].site}.su/icons/${syncStorage.watched[userID].service}/${userID}`, // URL to the icon to display
                                        title: `${unreadPosts + (unreadPosts == 50 ? "+" : "")} new post${unreadPosts > 1 ? 's' : ''} by ${syncStorage.watched[userID].creatorName}`,
                                        message: postTitles.join('\n') + (request.length > 3 ? ('\n...and ' + (request.length - 3) + (request.length == 50 ? '+' : '') + ' more') : ''),
                                    });
                                    notification.then((id) => {
                                        browser.notifications.onClicked.addListener((clickedID) => {
                                            if (clickedID == id) {
                                                browser.tabs.create({ url: `https://${syncStorage.watched[userID].site}.su/${syncStorage.watched[userID].service}/user/${userID}` });
                                            }
                                        })
                                    })
                                }
                                watchedIndex++;
                            }
                        })
                    }
                }, 1000)
            }
        })
    }, 9000000)
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
            let downloadStartStatus /*promise when the download is registered*/ = browser.downloads.download({ url: url })
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

function SendRequest(url) {
    console.log("Sending request to " + url);
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                resolve(response.text());
            })
            .catch(error => {
                // Handle errors
                console.error('Error fetching HTML:', error);
                reject(null);
            });
    })
}

function SetDB() {
    browserStorage.get().then((data) => {
        console.log("setting DB", data, syncStorage)
        syncStorage.lastDBUpdate = Date.now();
        browserStorage.set(syncStorage);
    })
}