const { storage } = browser;
const { session } = browser.storage;
const browserStorage = browser.storage.local;
import ProgressBar from 'progressbar.js';

let isMobile = /android|mobile/i.test(navigator.userAgent)
console.log("Mobile device: " + isMobile)

document.addEventListener('securitypolicyviolation', (e) => {
    console.log('Blocked URL:', e.blockedURI);
});

let settingsDefaults = {
    restoreThumbnailsFF: { value: true, pc: true, mobile: true, description: "Restore post thumbnails", explanation: 'Restores thumbnails of posts when no thumbnail exists. If the post contains no images, the content of the post itself is displayed instead.' },
    readPostsFF: { value: true, pc: true, mobile: true, description: "Mark visited posts", explanation: 'Add a "read" badge to visited posts.' },
    downloaderFF: { value: true, pc: true, mobile: true, description: "Image downloader", explanation: 'Add a download button to the corner of images.' },
    unreadDotFF: { value: true, pc: true, mobile: true, description: "Unread markers in favorites", explanation: 'Highlight users with new posts in your favorites.' },
    subscriptionsFF: { value: true, pc: true, mobile: false, description: "Subscriptions", explanation: 'Enables the subscription system. this adds a "subscribe" button to user pages. It also allows the extension to check for new posts in the background and to notify you of them with system notifications.' },
    wheelTiltFF: { value: true, pc: true, mobile: false, description: "Mouse wheel navigation", explanation: 'Use tilting of the mouse wheel for navigation.' },
    swipeNavigationFF: { value: true, pc: false, mobile: true, description: "Swipe navigation", explanation: 'Allows navigation with swipe gestures.' }
}

const regex = {
    // Regular expressions for ID extraction
    imageToIDRegex: /(?<=\/data\/\w+\/\w+\/)\w{7}(?=\w+\.\w+)/, // Finds ID in image link
    postToIDRegex: /(?<=\w+\/user\/[^/]+\/post\/)(\d+)/, // Finds ID in post link
    userToIDRegex: /(?<=\w+\/user\/)([^/?=]+)/, // Finds ID in user profile link

    // Regular Expressions for ID extraction on Discord servers
    serverToIDRegex: /(?<=discord\/server\/)\d{8}/, // Finds ID in Discord server URL
    channelToIDRegex: /(?<=discord\/server\/\d+#)\d{7}/, // Finds channel ID in Discord server URL
    discordRegex: /(?<=\/data\/\/\w+\/\w+\/)\w{7}/, // Finds image ID in image URL

    // Regular Expressions for URL matching
    userURLRegex: /\w+\/user\/[^/]+/, // Matches user profile URL pattern
    postURLRegex: /\w+\/user\/\w+\/post\/\d+/, // Matches post URL pattern
    otherRegex: /\w+\/(posts|search_hash)/,
    userBrowserRegex: /\w+\/(artists|favorites)/,
    discordURLRegex: /\/\w+.\w+\/discord/, // Matches discord server URL pattern
    siteRegex: /(?<=https:\/\/)\w+/, // Matches the service name from any url
    serviceRegex: /(?<=https:\/\/\w+\.su\/)\w+/, // Matches the service name from any url

    // Regular Expressions for amount of posts
    userPostAmountRegex: /(?<=Showing \d+ - \d+ of )(\d+)/, // Finds amount of posts in html
    getUserLinkFromPostLink: /.+\/user\/[^/]+/, // Finds user link from post link

    // Regular Expressions for API Requests
    postToApiRegex: /(https:\/\/\w+\.\w+)(.+)/,
    postContentToImageLinkRegex: /(?<=<img [\w\s"=\\-]+ src=\\?")[\w\.\/\\]+[a-zA-Z]/,

    // misc
    fileExtensionRegex: /(?<=\.)\w+$/,
    fileNameRegex: /(?<=f=).+$/,
    urlExtractionRegex: /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, // Extracts URLs from strings
    urlToPageRegex: /(?<=o=)\d+/, // Gets the page number from the url
    searchRequestRegex: /\?.*q=[^&]/ // Checks wether there is a search query active
};

let activeMobileDownloads = [];
let statusCircles = [];

// Create and append stylesheet link
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = chrome.runtime.getURL("./style.css");
CreateNodeObserver(
    (element) => {
        return element == document.body;
    },
    () => document.head.appendChild(stylesheet),
    true,
);

let postID;
let notificationID = 0;
let wheelTiltListener = false;
let lastPost;
let version = "2.0"
let currentURL = "";

// local DB copies
let syncStorage = {}; // not actually synchronous across devices, just persistent storage
let tempStorage = {};
let tempStorageDB;


if (isMobile) { // hides the sidebar at load
    CreateNodeObserver((element) => element.classList.contains("global-sidebar"), (element) => {

        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const sidebar = document.getElementsByClassName("close-sidebar")[0];
                    sidebar.click();
                    observer.disconnect();
                }
            };
        })

        observer.observe(element, {
            attributes: true,
            attributeFilter: ['class'], // Only watch the 'class' attribute
        });
    }, true)
}

browser.runtime.onMessage.addListener((message) => {
    if (message.type == "refresh" && document.URL != currentURL) {
        currentURL = document.URL;
        console.log("refresh");
        FetchDB().then(() => {
            SetupIndexedDB("Storage", "SessionStorage").then((db) => {
                tempStorageDB = db
                GetSessionStorage().then(() => {
                    Main();
                });
            });
        });
    }
})

document.addEventListener('securitypolicyviolation', (e) => {
    if (e.blockedURI == "https://cdn.tsyndicate.com/sdk/v1/p.js" && document.URL != currentURL) {
        currentURL = document.URL;
        console.log("refresh");
        FetchDB().then(() => {
            SetupIndexedDB("Storage", "SessionStorage").then((db) => {
                tempStorageDB = db
                GetSessionStorage().then(() => {
                    Main();
                });
            });
        });
    }
});



function Main() {
    if (!tempStorage.hasOwnProperty("version") || tempStorage.version != version) {
        tempStorage = { postDB: {}, urls: {}, version: version };
        SetSessionStorage()
    }
    ReceiveSettingsUpdates();
    AddMouseTiltListener();
    if (isMobile && syncStorage.settings.swipeNavigationFF.value) {
        SwipeNavigation()
    }

    // if URL is a post page
    if (regex.postURLRegex.test(document.URL)) {
        SeePostFromPost();

        postID = document.URL.match(regex.postToIDRegex)[0];
        if (document.readyState == "complete") {
            let textDivs = document.getElementsByClassName("fileThumb")
            for (let i = 0; i < textDivs.length; i++) {
                if (!textDivs[i].firstElementChild.complete) {
                    textDivs[i].firstElementChild.addEventListener("load", (imageDiv) => {
                        CreateDownloadButton(textDivs[i], "href", regex.imageToIDRegex);
                    })
                }
                else {

                    CreateDownloadButton(textDivs[i], "href", regex.imageToIDRegex);
                }
            }
        } else {
            window.onload = () => {
                let textDivs = document.getElementsByClassName("fileThumb")
                for (let i = 0; i < textDivs.length; i++) {
                    if (!textDivs[i].firstElementChild.complete) {
                        textDivs[i].firstElementChild.addEventListener("load", (imageDiv) => {
                            CreateDownloadButton(textDivs[i], "href", regex.imageToIDRegex);
                        })
                    }
                    else {

                        CreateDownloadButton(textDivs[i], "href", regex.imageToIDRegex);
                    }
                }
            }
        }
    }

    // if URL is a user page
    else if (regex.userURLRegex.test(document.URL)) {
        let userID = document.URL.match(regex.userToIDRegex)[0]
        if (!syncStorage.postDB.hasOwnProperty(userID)) {
            syncStorage.postDB[userID] = {}
        }
        if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
            syncStorage.postDB[userID].data = {}
        }
        if (syncStorage.postDB[userID].data.lastPostDate !== undefined) {
            lastPost = syncStorage.postDB[userID].data.lastPostDate
        }
        let userHeader = document.getElementsByClassName("user-header__actions")
        let element = userHeader[0]
        element.classList.add("read-all-div");
        if (!isMobile) {
            CreateSubscribeButton(element);
            element.parentElement.parentElement.style.maxWidth = "800px";
        }
        let elements = element.children;
        for (let i = 0; i < elements.length; i++) {
            elements[i].style = "margin-right: 0px;";
        }


        GetLastPostDate(document.URL.match(regex.siteRegex)[0], document.URL.match(regex.serviceRegex)[0], document.URL.match(regex.userToIDRegex)[0]).then(lastPostDate => {
            let postElements = document.getElementsByClassName("post-card__header")
            for (let i = 0; i < postElements; i++) CreateSeenBadge(postElements[i], lastPostDate)
            syncStorage.postDB[userID].data.lastPostDate = lastPostDate
            SetDB()
        })

        let postElements = document.getElementsByClassName("post-card__header")
        for (let i = 0; i < postElements.length; i++) CreateSeenBadge(postElements[i], lastPost)


        if (!syncStorage.postDB.hasOwnProperty(userID)) {
            syncStorage.postDB[userID] = {};
        }
        if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
            syncStorage.postDB[userID].data = {};
        }


        const service = document.URL.match(regex.siteRegex)[0];
        SendRequest(`https://${service}.su/api/v1/creators.txt`, 600).then((dataString) => {
            let data = JSON.parse(dataString);
            let entry = data.find((element) => {
                return String(element.id) == userID
            })
            FetchDB().then(() => {
                if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
                    syncStorage.postDB[userID].data = {};
                }
                syncStorage.postDB[userID].data.lastImportDate = entry.updated * 1000;
                SetDB();
                browser.runtime.sendMessage({ type: "DBUpdate" });
            })
        });

        if (regex.searchRequestRegex.test(document.URL)) {
            RestoreImagesOLD()
        }
        else {
            RestoreImages();
        }

        RegularUpdatePosts()
    }

    // If URL is another page with posts
    else if (regex.otherRegex.test(document.URL)) {
        RestoreImagesOLD();
    }

    // If URL is a user browser
    else if (regex.userBrowserRegex.test(document.URL)) {
        AddUnreadBadges();
        RegularUpdateUnreadBadges();
    }


    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (String(message.type) == "download") {
            let downloadButton = document.querySelector(
                "div[url='" + message.url + "']",
            ).children[0];
            downloadButton.setAttribute("class", message.status);
        }
    });
    SetDB();
    browserStorage.set(syncStorage);
}

function CreateSubscribeButton(parentNode) { //Adds subscription button on user pages
    if (!syncStorage.settings.subscriptionsFF.value ||
        document.getElementById("subscribe") != null) {
        return;
    }
    parentNode.style.display = "flex"
    let subscribeExisting = document.getElementById("subscribe");
    if (subscribeExisting) {
        subscribeExisting.style.display = "block";
    }

    let lastPostTags = document.getElementsByTagName("small");
    let lastPostAmount;

    if (lastPostTags == undefined || lastPostTags.length == 0) {
        lastPostAmount = document.getElementsByClassName("post-card post-card--preview").length;
    } else {
        lastPostAmount = parseInt(lastPostTags[0].textContent.match(regex.userPostAmountRegex)[0]);
    }

    const subscribeButton = document.createElement("button");

    let userID = document.URL.match(regex.userToIDRegex)[0];
    if (!syncStorage.subscribed.hasOwnProperty(userID)) {
        subscribeButton.classList.add("subscribe");
        subscribeButton.textContent = "Subscribe";
        subscribeButton.id = "subscribe";
    } else {
        subscribeButton.classList.add("subscribe");
        subscribeButton.classList.add("subscribed");
        subscribeButton.textContent = "Subscribed";
    }

    parentNode.appendChild(subscribeButton);
    subscribeButton.addEventListener("click", function () {
        let name = document.querySelector("span[itemprop=\"name\"]").textContent;
        name = name.charAt(0).toUpperCase() + name.slice(1);
        let profilePictureURL = document.getElementsByClassName("fancy-image__image")[1].getAttribute("src");
        if (syncStorage.subscribed.hasOwnProperty(userID)) {
            SendNotification("Unsubscribed from " + name, profilePictureURL)
            delete syncStorage.subscribed[userID];

            subscribeButton.classList.remove("subscribed");
            subscribeButton.textContent = "Subscribe";
        } else {
            SendNotification("Subscribed to " + name, profilePictureURL)
            let site = document.URL.match(regex.siteRegex)[0];
            let service = document.URL.match(regex.serviceRegex)[0];
            FetchDB().then(() => {
                syncStorage.subscribed[userID] = {}
                syncStorage.subscribed[userID].site = document.URL.match(regex.siteRegex)[0];
                syncStorage.subscribed[userID].service = document.URL.match(regex.serviceRegex)[0];
                syncStorage.subscribed[userID].creatorName = name;

                SetDB();
                browserStorage.set(syncStorage);

                const apiURL = `https://${site}.su/api/v1/${service}/user/${userID}`;
                SendRequest(apiURL, 300).then((dataString) => {
                    const request = JSON.parse(dataString);
                    if (request != null) {
                        FetchDB().then(() => {
                            syncStorage.subscribed[userID].lastPost = request[0].added;
                            SetDB();
                            browserStorage.set(syncStorage);
                        })
                    }
                })
            })

            subscribeButton.classList.add("subscribed");
            subscribeButton.textContent = "Subscribed";
        }
        SetDB();
        browserStorage.set(syncStorage);
    });
}

function GetLastPostDate(site, service, userID) { // returns the last post date of a given user
    return new Promise(resolve => {
        SendRequest(`https://${site}.su/api/v1/${service}/user/${userID}`, 180).then(response => {
            response = JSON.parse(response)
            let date = DateToUnix(response[0].added)
            lastPost = date
            resolve(lastPost)
        })
    })
}

function CreateSeenBadge(postElement, lastPostDate) { //Creates a badge and style for posts that have been seen or read previously
    if (!syncStorage.settings.readPostsFF.value) { 
        return;
    }
    let userID = postElement.parentElement.href.match(regex.userToIDRegex)[0];
    if (!syncStorage.postDB.hasOwnProperty(userID)) {
        syncStorage.postDB[userID] = {};
    }
    if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
        syncStorage.postDB[userID].data = {};
    }

    const postID = postElement.parentElement.href.match(regex.postToIDRegex)[0];
    let postDate = postElement.parentElement.getElementsByClassName("timestamp")[0].dateTime;
    let postUnix = DateToUnix(postDate);
    let newPost = lastPostDate != NaN && lastPostDate != undefined && lastPostDate < postUnix
    if (syncStorage.postDB[userID].hasOwnProperty(postID) || newPost) {
        if (postElement.parentElement.getElementsByClassName("post-card__image-container").length == 0) {
            let textDiv = document.createElement("div");
            textDiv.classList.add("post-card__image-container");
            if (syncStorage.postDB[userID].hasOwnProperty(postID)) {
                textDiv.classList.add("seen-post");
            }
            postElement.parentElement.insertBefore(textDiv, postElement.parentElement.children[1]);
        }
        else if (syncStorage.postDB[userID].hasOwnProperty(postID)) {
            postElement.parentElement.children[1].classList.add("seen-post");
        }
        let seenBadges = postElement.parentElement.getElementsByClassName("seen-badge");
        if (syncStorage.postDB[userID].hasOwnProperty(postID)) {
            postElement.parentElement.style = "border-style: solid; border-radius: 0px; border-color: rgba(0, 0, 0, 0); border-width: 0px;  transition: all 0.1s ease"
            if (seenBadges.length == 0) {
                let seenBadge = document.createElement("p");
                seenBadge.classList.add("seen-badge");
                seenBadge.textContent = "Read";
                postElement.parentElement.appendChild(seenBadge);
            } else {
                seenBadges[0].textContent = "Read";
            }
        }
        else {
            postElement.parentElement.style = "border-style: solid; border-radius: 7px; border-color: yellow; overflow: hidden; border-width: 2px; transition: border-width 0.5s ease"
        }
    } else {
        postElement.nextElementSibling.classList.remove("seen-post");
        let seenBadge = postElement.parentElement.getElementsByClassName("seen-badge");
        if (seenBadge.length > 0) {
            seenBadge[0].remove();
        }
    }
}

async function AddUnreadBadges() { // adds a badge to user browsers which indicates which of the users, has posts that are new
    if (!syncStorage.settings.unreadDotFF.value) {
        return;
    }
    await GetSessionStorage()

    let service = document.location.href.match(regex.siteRegex)[0];
    let data;
    await SendRequest(`https://${service}.su/api/v1/creators.txt`, 600).then((dataString) => {
        data = JSON.parse(dataString);
    })
    let profiles = document.getElementsByClassName("user-card")

    if (profiles.length > 0) {
        let profileData = {};
        for (let i = 0; i < profiles.length; i++) {
            let postUserID = profiles[i].href.match(regex.userToIDRegex)[0];
            profileData[postUserID] = null;
        }
        data.map((element) => {
            if (profileData.hasOwnProperty(element.id)) {
                profileData[element.id] = element;
            }
        })
        for (let i = 0; i < profiles.length; i++) {
            CreateUnreadBadge(profiles[i], profileData[profiles[i].href.match(regex.userToIDRegex)[0]]);
        }
    }
}

function CreateUnreadBadge(element, entry) {
    /*
    let entry = data.find((dataElement) => {
        return dataElement.id == element.href.match(regex.userToIDRegex)[0];        // This has to be the worst code I have ever written
    })
    */
    if (syncStorage.postDB.hasOwnProperty(entry.id)) {
        if (!syncStorage.postDB[entry.id].data.hasOwnProperty("lastImportDate") ||
            syncStorage.postDB[entry.id].data.lastImportDate == NaN ||
            syncStorage.postDB[entry.id].data.lastImportDate == -1) {
            syncStorage.postDB[entry.id].data.lastImportDate = -1;
        } else {
            let lastImportDate = syncStorage.postDB[entry.id].data.lastImportDate;
            let hasUnreadPosts = entry.updated * 1000 > lastImportDate;

            console.log("has new posts: " + hasUnreadPosts);
            if (hasUnreadPosts && !element.classList.contains("new-posts-user")) {
                let unreadDot = document.createElement("div");
                unreadDot.classList.add("new-posts")
                element.appendChild(unreadDot);
                element.classList.add("new-posts-user")
            } else if (!hasUnreadPosts && element.classList.contains("new-posts-user")) {
                element.classList.remove("new-posts-user")
                element.removeChild(element.getElementsByClassName("new-posts")[0])
            }
        }
    }
}

function SeePostFromPost() {
    if (!syncStorage.settings.readPostsFF.value) {
        return;
    }
    let userID = document.URL.match(regex.userToIDRegex)[0];
    let postID = document.URL.match(regex.postToIDRegex)[0];
    if (!syncStorage.postDB.hasOwnProperty(userID)) {
        syncStorage.postDB[userID] = {};
        syncStorage.postDB[userID][postID] = {};
    } else if (!syncStorage.postDB[userID].hasOwnProperty(postID)) {
        syncStorage.postDB[userID][postID] = {};
    }
    if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
        syncStorage.postDB[userID].data = {};
    }
    SetDB();
    browserStorage.set(syncStorage);
    console.log("sending DB update...")
    browser.runtime.sendMessage({ type: "DBUpdate" });
}

function CreateDownloadButton(element, attribute, attributeRegex) {
    if (!syncStorage.settings.downloaderFF.value) {
        return;
    }
    let imageID = element[attribute].match(attributeRegex)[0];
    let imageURL = element.href; // collection of links for full size images
    let thumbnailURL = element.children[0].src;
    let downloadDiv = document.createElement("div"); // download button creation
    downloadDiv.classList.add("download-div");
    downloadDiv.setAttribute("url", imageURL);
    element.classList.add("image-div");
    const postID = document.URL.match(regex.postToIDRegex)[0];
    const userID = document.URL.match(regex.userToIDRegex)[0];
    element.appendChild(downloadDiv);
    let downloadIcon = document.createElement("div");
    downloadDiv.URL = imageURL;
    downloadDiv.appendChild(downloadIcon);
    if (syncStorage.postDB[userID][postID].hasOwnProperty(imageID)) {
        downloadDiv.children[0].classList.add("download-finished");
    } else {
        downloadDiv.children[0].classList.add("download");
    }
    let pBContainer = document.createElement("div");
    pBContainer.id = "progress-container";
    downloadDiv.appendChild(pBContainer);
    downloadDiv.addEventListener("mouseenter", () => {
        downloadDiv.parentElement.style.pointerEvents = "none"
    })
    downloadDiv.addEventListener("mouseleave", () => {
        downloadDiv.parentElement.style.pointerEvents = "all"
    })
    downloadDiv.addEventListener("click", (e) => {
        QueDownload(imageURL, downloadDiv, thumbnailURL);
    });
}

function QueDownload(url, downloadDiv, thumbnailURL) {
    const downloadIcon = downloadDiv.children[0];

    if (downloadIcon.nextElementSibling == null || downloadIcon.nextElementSibling.children.length == 0) { //download is not running
        downloadIcon.style.opacity = 0;
        let circle = new ProgressBar.Circle(downloadIcon.nextElementSibling, {
            color: "white",
            duration: 400,
            easing: 'easeInOut',
            strokeWidth: 7
        });
        statusCircles.push({ url: url, statusCircle: circle });
        let statusCircle = statusCircles[statusCircles.length - 1].statusCircle;
        statusCircle.set(0.01);
        downloadIcon.nextElementSibling.style.opacity = 1;
        const imageID = url.match(regex.imageToIDRegex)[0];
        const userID = document.URL.match(regex.userToIDRegex)[0];
        let cancelButton = document.createElement("div");
        cancelButton.classList.add("download-cancel");
        downloadIcon.parentElement.appendChild(cancelButton);
        if (isMobile) {
            console.log("Downloading " + url);
            cancelButton.style.opacity = 1;
            MobileDownload(url, (progress) => {
                statusCircle.animate(Math.max(progress / 100, 0.01));
            }, () => {
                let fetchIndex = activeMobileDownloads.findIndex(download => download.url === url);
                if (fetchIndex !== -1) {
                    activeMobileDownloads.splice(fetchIndex, 1);
                }
            }, thumbnailURL).then(response => response.blob())
                .then(blob => {
                    const responseUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = responseUrl;
                    a.download = url.match(regex.fileNameRegex)[0];
                    a.click();
                    URL.revokeObjectURL(responseUrl);
                    syncStorage.postDB[userID][postID][imageID] = Date.now();
                    SetDB();
                    browserStorage.set(syncStorage);
                    statusCircle.animate(1);
                    cancelButton.style.opacity = 0;
                    setTimeout(() => { cancelButton.remove(); }, 200);
                    setTimeout(() => {
                        downloadIcon.classList = ["download-finished"];
                        downloadIcon.style.opacity = 1
                        downloadIcon.nextElementSibling.style.opacity = 0;
                        setTimeout(() => {
                            statusCircle.destroy();
                            statusCircles.splice(statusCircles.indexOf({ url: url, statusCircle: statusCircle }), 1);
                        }, 100);
                    }, 500)

                })
        } else {
            browser.runtime.onMessage.addListener((request) => {
                if (request.type == "DownloadProgress" && request.url == url) {
                    if (request.status == "downloading") {
                        statusCircle.animate(Math.max(request.progress / 100, 0.01))
                    } else if (request.status == "download-complete") {
                        statusCircle.animate(1);
                        cancelButton.style.opacity = 0;
                        setTimeout(() => { cancelButton.remove(); }, 200);
                        setTimeout(() => {
                            downloadIcon.classList = ["download-finished"];
                            downloadIcon.style.opacity = 1
                            downloadIcon.nextElementSibling.style.opacity = 0;
                            setTimeout(() => {
                                statusCircle.destroy();
                                statusCircles.splice(statusCircles.indexOf({ url: url, statusCircle: statusCircle }), 1);
                            }, 200);
                        }, 500)
                    } else if (request.status == "download-cancelled") {
                        statusCircle.animate(0);
                        cancelButton.style.opacity = 0;
                        setTimeout(() => { cancelButton.remove(); }, 200);
                        setTimeout(() => {
                            downloadIcon.classList = ["download"];
                            downloadIcon.style.opacity = 1
                            downloadIcon.nextElementSibling.style.opacity = 0;
                            setTimeout(() => {
                                statusCircle.destroy();
                                statusCircles.splice(statusCircles.indexOf({ url: url, statusCircle: statusCircle }), 1);
                            }, 200);
                        }, 500)
                    }
                }
            })
            SendNotification("Downloading", thumbnailURL);
            browser.runtime.sendMessage({ url: url, type: "download", DBPath: { userID: userID, postID: postID, imageID: imageID } });
        }
    } else {  //download is running
        console.log("download running")
        let statusCircle = statusCircles.find((element) => (element.url == url)).statusCircle;
        statusCircle.animate(0);
        let cancelButton = downloadIcon.parentElement.lastElementChild;
        cancelButton.style.opacity = 0;
        setTimeout(() => { cancelButton.remove(); }, 200);
        setTimeout(() => {
            downloadIcon.classList = ["download"];
            downloadIcon.style.opacity = 1
            downloadIcon.nextElementSibling.style.opacity = 0;
            setTimeout(() => {
                let ssIndex = statusCircles.findIndex((element) => element.url == url)
                statusCircles.splice(ssIndex, 1);
                statusCircle.destroy();
            }, 100);
        }, 500)

        if (isMobile) {
            console.log(activeMobileDownloads);
            let fetchEntry = activeMobileDownloads.find((element) => (element.url == url));
            if (fetchEntry != undefined) {
                fetchEntry.controller.abort();
            }
            else {
                console.log("No entry found");
                console.log(activeMobileDownloads);
            }
        } else {
            browser.runtime.sendMessage({ url: url, type: "download cancel" });
        }
    }
}

async function MobileDownload(url, onProgress, onFinish, thumbnailURL) {
    if (activeMobileDownloads.find((element) => element.url == url) != undefined) return
    SendNotification("Downloading", thumbnailURL);
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchVar = fetch(url, { signal });
    activeMobileDownloads.push({ url: url, controller: controller });

    try {
        const response = await fetchVar;
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentLength = response.headers.get('Content-Length');
        if (!contentLength) {
            throw new Error('Content-Length response header unavailable');
        }

        const total = parseInt(contentLength, 10);
        let loaded = 0;

        const reader = response.body.getReader();
        const stream = new ReadableStream({
            start(controller) {
                function push() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            controller.close();
                            onFinish();
                            return;
                        }

                        loaded += value.byteLength;
                        onProgress((loaded / total) * 100);

                        controller.enqueue(value);
                        push();
                    }).catch(error => {
                    });
                }

                push();
            }
        });

        return new Response(stream);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted');
        } else {
            console.error('Fetch error:', error);
        }
    }
}

function HandleWheelTilt(event) {
    if (!syncStorage.settings.wheelTiltFF.value) {
        return;
    }
    // Check for horizontal scrolling
    if (event.deltaX) {
        // deltaX property indicates horizontal scrolling
        var deltaX = event.deltaX;
        if (deltaX > 0) {
            let linkRight = document.getElementsByClassName("next");
            if (linkRight.length > 0) {
                linkRight[0].click()
            }
        } else {
            let linkLeft = document.getElementsByClassName("prev");
            if (linkLeft.length > 0) {
                linkLeft[0].click()
            }
        }
    }
}

function AddMouseTiltListener() {
    if (!wheelTiltListener) {
        wheelTiltListener = true;
        // Add wheel event listener
        if ("onwheel" in document) {
            // Modern browsers support the 'wheel' event
            document.addEventListener("wheel", HandleWheelTilt);
        } else {
            // Legacy browsers support the 'mousewheel' event
            document.addEventListener("mousewheel", HandleWheelTilt);
        }
    }
}

function RestoreImages() {
    if (!syncStorage.settings.restoreThumbnailsFF.value) {
        return
    }
    GetSessionStorage().then(() => {
        if (document.readyState == "complete") {
            let elements = document.querySelectorAll('a[href]:not(:has(.post-card__image)):is(.post-card > a)');
            if (elements.length > 0) RestoreThumbnails(elements)
        }
        else {
            window.onload = () => {
                let elements = document.querySelectorAll('a[href]:not(:has(.post-card__image)):is(.post-card > a)');
                if (elements.length > 0) RestoreThumbnails(elements)
            }
        }
    })
}

function RestoreThumbnails(elements) {
    let site = document.URL.match(regex.siteRegex)[0];
    let service = document.URL.match(regex.serviceRegex)[0];
    let page = undefined
    try { page = document.URL.match(regex.urlToPageRegex)[0] }
    catch { page = 0 }
    let userID = document.URL.match(regex.userToIDRegex)[0]
    SendRequest(`https://${site}.su/api/v1/${service}/user/${userID}?o=${page}`, 0).then(posts => {
        posts = JSON.parse(posts)
        GetSessionStorage().then(() => {
            for (let i = 0; i < elements.length; i++) {
                let element = elements[i];
                let postID = element.href.match(regex.postToIDRegex)[0];

                if (tempStorage.postDB.hasOwnProperty(userID) &&
                    tempStorage.postDB[userID].hasOwnProperty(postID) &&
                    tempStorage.postDB[userID][postID].hasOwnProperty("type")) {
                    console.log("post cached")
                    let entry = tempStorage.postDB[userID][postID];
                    CreateThumbnail(element, entry.content, entry.type);
                } else {
                    console.log("not cached")
                    let data = posts.find((element) => element.id == postID)
                    if (data.length < 1) {
                        console.error("post not found. response: " + response)
                    }
                    else {
                        let imageFormats = ["png", "jpg", "jpeg", "webp", "gif"]
                        let videoFormats = ["mp4", "webm", "mkv", "avi", "m4v"]
                        let thumbnail = { image: undefined, video: undefined };


                        try {
                            const parser = new DOMParser();
                            let contentDOM = parser.parseFromString(data.content, 'text/html')
                            let imageElements = Array.from(contentDOM.all).filter(element3 => element3.tagName == "IMG" || element3.tagName == "VIDEO")

                            if (imageElements.length > 0) {
                                thumbnail.image = imageElements.find((element) => imageFormats.includes(element.src.match(regex.fileExtensionRegex)[0])).src

                                if (thumbnail.image == undefined) {
                                    thumbnail.video = imageElements.find((element) => videoFormats.includes(element.src.match(regex.fileExtensionRegex)[0])).src
                                }
                            }
                        } catch { }


                        if (thumbnail.image == undefined) {
                            try {
                                let fileExtension = data.file.path.match(regex.fileExtensionRegex)[0]
                                if (imageFormats.includes(fileExtension)) {
                                    thumbnail.image = [data.file.path]

                                }
                                if (thumbnail.image == undefined && thumbnail.video == undefined) {
                                    if (videoFormats.includes(fileExtension)) {
                                        thumbnail.video = [data.file.path]
                                    }
                                }
                            } catch { };
                        }


                        if (thumbnail.image == undefined)
                            try {
                                thumbnail.image = data.attachments.find((element) =>
                                    imageFormats.includes(element.path.match(regex.fileExtensionRegex)[0]))
                                    .map(element => element.path)

                                if (thumbnail.image == undefined && thumbnail.video == undefined) {
                                    thumbnail.video = data.attachments.find((element) =>
                                        videoFormats.includes(element.path.match(regex.fileExtensionRegex)[0]))
                                        .map(element => element.path)
                                }
                            } catch { }
                        if (!tempStorage.postDB.hasOwnProperty(userID)) {
                            tempStorage.postDB[userID] = {};
                            SetSessionStorage()
                        }
                        if (!tempStorage.postDB[userID].hasOwnProperty(postID)) {
                            tempStorage.postDB[userID][postID] = {};
                            SetSessionStorage()
                        }
                        if (thumbnail.image != undefined) {
                            tempStorage.postDB[userID][postID] = { type: "img", content: thumbnail.image }

                            CreateThumbnail(element, thumbnail.image, "img");
                        }

                        else if (thumbnail.video != undefined) {
                            tempStorage.postDB[userID][postID] = { type: "video", content: thumbnail.video }

                            CreateThumbnail(element, thumbnail.video, "video");
                        }

                        else {
                            tempStorage.postDB[userID][postID] = { type: "text", content: data }

                            CreateThumbnail(element, data, "text");
                        }
                    }
                }
            }
            SetSessionStorage()
        })
    })
}

function RequestRestoreImage(element) {
    return new Promise((resolve) => {
        const href = element.href
        const urlMatches = href.match(regex.postToApiRegex);
        const apiURL = urlMatches[1] + "/api/v1" + urlMatches[2];
        SendRequest(apiURL, 300).then((data) => {
            const request = JSON.parse(data);
            if (request != null) {
                resolve([request, apiURL])
            }
            resolve(undefined);
        })
    })
}

function CreateThumbnail(element, content, type) {
    if (type == "img" || type == "video") {
        if (element.getElementsByClassName("post-card__image-container").length == 0) {
            const textDiv = document.createElement("div");
            textDiv.classList.add("post-card__image-container");
            element.insertBefore(textDiv, element.firstElementChild.nextElementSibling);
        }
        const textDiv = element.children[1];
        const imageElement = document.createElement(type)
        imageElement.classList.add("post-card__image")
        imageElement.src = content
        textDiv.appendChild(imageElement)
    } else if (type == "text") {
        if (element.getElementsByClassName("post-card__image-container").length == 0) {
            const textDiv = document.createElement("div");
            textDiv.classList.add("post-card__image-container");
            element.insertBefore(textDiv, element.firstElementChild.nextElementSibling);
        }
        const textDiv = element.children[1];
        textDiv.classList.add("text-thumbnail-div");
        textDiv.style = "padding-top: " + element.firstElementChild.offsetHeight + "px;" +
            "padding-bottom: " + element.lastElementChild.offsetHeight + "px;"

        let gradientElement1 = document.createElement("div");
        gradientElement1.classList.add("text-thumbnail-gradient");
        let gradient1 = textDiv.appendChild(gradientElement1);
        gradient1.style.top = element.firstElementChild.offsetHeight + "px";

        const parser = new DOMParser();
        const textElement = parser.parseFromString(content.content + (
            content.hasOwnProperty("file") && Object.keys(content.file).length != 0 ?
                `<a class="post__attachment-link" href="https://${document.URL.match(regex.siteRegex)}.su/data${content.file.path}" download="${content.file.name}">Download ${content.file.name}</a >` :
                ""
        ), 'text/html');
        textDiv.appendChild(textElement.body)
        let textBody = textDiv.lastElementChild;
        textBody.classList.add("text-thumbnail")
        textBody.scroll(0, 0);

        let gradientElement2 = document.createElement("div");
        gradientElement2.classList.add("text-thumbnail-gradient");
        let gradient2 = textDiv.appendChild(gradientElement2);
        gradient2.style.transform = "rotate(180deg)";
        gradient2.style.bottom = element.lastElementChild.offsetHeight + "px";

    } else {
        console.error("unknown type: " + type)
    }
}

function RestoreImagesOLD() {
    if (!syncStorage.settings.restoreThumbnailsFF.value) {
        return
    }
    let restoredImages = 0;
    let elements = document.querySelectorAll('a[href]:not(:has(.post-card__image)):is(.post-card > a)');
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        let postUserID = element.href.match(regex.postToIDRegex)[0];
        let postID = element.href.match(regex.postToIDRegex)[0];

        if (tempStorage.postDB.hasOwnProperty(postUserID) && tempStorage.postDB[postUserID].hasOwnProperty(postID)) {
            let entry = tempStorage.postDB[postUserID][postID];
            CreateThumbnail(element, entry.content.post, entry.type);
        } else {
            restoredImages++;
            setTimeout(() => {
                RequestRestoreImage(element).then((data) => {

                    let imageFormats = ["png", "jpg", "jpeg", "webp", "gif"]
                    let contentLinks;
                    try {
                        contentLinks = data[0].post.content.match(regex.postContentToImageLinkRegex)
                            .filter((element) => { console.log(element, element.match(regex.fileExtensionRegex)[0]); return imageFormats.includes(element.match(regex.fileExtensionRegex)[0]) })
                    } catch { }

                    let attachmentLinks;
                    try {
                        attachmentLinks = data[0].post.attachments.filter((element) =>
                            imageFormats.includes(element.path.match(regex.fileExtensionRegex)[0]))
                            .map(element => element.path)
                    } catch { }

                    let imageLinks = [];
                    if (attachmentLinks != undefined && attachmentLinks.length > 0) {
                        imageLinks = attachmentLinks
                    } else if (contentLinks != undefined && contentLinks.length > 0) {
                        imageLinks = contentLinks
                    }

                    if (!tempStorage.postDB.hasOwnProperty(postUserID)) {
                        tempStorage.postDB[postUserID] = {}
                        SetSessionStorage()
                    }

                    if (imageLinks.length > 0) {
                        CreateThumbnail(element, imageLinks[0], "img");
                        tempStorage.postDB[postUserID][postID] = { type: "img", content: imageLinks[0] }
                        SetSessionStorage()
                    } else {
                        CreateThumbnail(element, data[0].post, "text");

                        tempStorage.postDB[postUserID][postID] = { type: "text", content: data[0] }
                        SetSessionStorage()
                    }
                })
            }, restoredImages * 800)
        }
    }
    GetSessionStorage();
}

function RegularUpdatePosts() {
    browser.runtime.onMessage.addListener((request) => {
        if (request.type == "DBUpdate") {
            FetchDB().then(() => {
                const postElements = document.getElementsByClassName("post-card__header");
                for (let i = 0; i < postElements.length; i++) {
                    CreateSeenBadge(postElements[i], lastPost);
                }
            });
        }
    })
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            let lastDBUpdateOld = syncStorage.lastDBUpdate;
            FetchDB().then(() => {
                if (lastDBUpdateOld != syncStorage.lastDBUpdate) {
                    const postElements = document.getElementsByClassName("post-card__header");
                    for (let i = 0; i < postElements.length; i++) {
                        CreateSeenBadge(postElements[i], lastPost);
                    }
                }
            });
        }
    })
}

function RegularUpdateUnreadBadges() {
    browser.runtime.onMessage.addListener((request) => {
        if (request.type == "DBUpdate") {
            FetchDB().then(() => {
                AddUnreadBadges();
            });
        }
    })
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            let lastDBUpdateOld = syncStorage.lastDBUpdate;
            FetchDB().then(() => {
                if (lastDBUpdateOld != syncStorage.lastDBUpdate) {
                    AddUnreadBadges();
                }
            });
        }
    })
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
            SetDB();
            resolve();
        })
    })
}

function SetDB() {
    browserStorage.get().then((data) => {
        syncStorage.lastDBUpdate = Date.now();
        browserStorage.set(syncStorage);
    })
}

function SetSessionStorage() {
    SetItemInDB(tempStorageDB, "SessionStorage", tempStorage);
}

function GetSessionStorage() {
    return new Promise((resolve) => {
        GetItemFromDB(tempStorageDB, "SessionStorage").then((data) => {
            let tempStorageTemp = structuredClone(data[0])
            tempStorage = SyncObjects(tempStorage, tempStorageTemp)
            if (tempStorage == null || tempStorage == undefined || tempStorage.length == 0) {
                tempStorage = { postDB: {}, urls: {}, version: version };
            }
            else {
                if (!tempStorage.hasOwnProperty("postDB")) {
                    tempStorage.postDB = {}
                }
                if (!tempStorage.hasOwnProperty("urls")) {
                    tempStorage.urls = {}
                }
                if (!tempStorage.hasOwnProperty("version")) {
                    tempStorage.version = version
                }
            }
            SetSessionStorage()
            console.log("complete", tempStorage)
            resolve()
        });
    })
}

function ReceiveSettingsUpdates() {
    browser.runtime.onMessage.addListener((request) => {
        if (request.type == "settingsUpdate") {
            FetchDB().then(() => {
                if (request.setting == "wheelTiltFF") {
                }
                else if (request.setting == "readPostsFF") {
                    if (!syncStorage.settings.readPostsFF.value) {
                        let seenBadges = document.getElementsByClassName("seen-badge");
                        let seenBadgesLength = seenBadges.length
                        let seenPosts = document.getElementsByClassName("seen-post");
                        let seenPostsLength = seenPosts.length
                        for (let i = 0; i < seenBadgesLength; i++) {
                            seenBadges[0].remove();
                        }
                        for (let i = 0; i < seenPostsLength; i++) {
                            seenPosts[0].classList.remove("seen-post");
                        }
                    }
                    let posts = document.getElementsByClassName("post-card__header")
                    for (let i = 0; i < posts.length; i++) {
                        CreateSeenBadge(posts[i], lastPost);
                    }
                }
                else if (request.setting == "downloaderFF") {
                    if (!request.value) {
                        let downloadButtons = document.getElementsByClassName("download-div");
                        let downloadButtonsLength = downloadButtons.length;
                        for (let i = 0; i < downloadButtonsLength; i++) {
                            downloadButtons[0].remove();
                        }
                    } else {
                        let textDivs = document.getElementsByClassName("fileThumb")
                        for (let i = 0; i < textDivs.length; i++) {
                            CreateDownloadButton(textDivs[i], "href", regex.imageToIDRegex);
                        }
                    }
                }
                else if (request.setting == "unreadDotFF") {
                    if (request.value) {
                        AddUnreadBadges();
                    }
                    else {
                        let dots = document.getElementsByClassName("new-posts");
                        let profiles = document.getElementsByClassName("new-posts-user");

                        while (dots.length != 0) {
                            dots[0].remove();
                        }
                        while (profiles.length != 0) {
                            profiles[0].classList.remove("new-posts-user");
                        }
                    }
                }
                else if (request.setting == "restoreThumbnailsFF") {
                    window.location.href = document.URL
                }
                else if (request.setting = "all") {
                    window.location.href = document.URL
                }
                else {
                    console.warn("unknown setting: " + request.setting)
                }
            })
        }
    })
}

function DateToUnix(dateString) {
    const date = new Date(dateString);
    return date.getTime() / 1000;
}

function CreateNodeObserver(
    Test,
    Callback,
    singleUse = false,
    node = document,
) {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && Test(node)) {
                    Callback(node);
                    if (singleUse) {
                        observer.disconnect();
                    }
                }
            }
        }
    });

    observer.observe(node, { childList: true, subtree: true });
}

function SendRequest(url, lifetimeS = 0) {
    return new Promise((resolve, reject) => {
        if (Object.hasOwn(tempStorage.urls, url)) {
            if (Date.now() - tempStorage.urls[url].date <= tempStorage.urls[url].lifetime * 1000) {
                console.log("retrieving cached data from " + url)
                resolve(tempStorage.urls[url].data)
                return
            }
        }
        console.log("Sending request to " + url);
        let before = Date.now();
        fetch(url).then(response => {
            if (!response.ok) {
                reject('Network response was not ok');
                return
            }
            console.log("request to " + url + " took " + (Date.now() - before) / 1000 + " seconds")
            response.text().then(responseText => {
                if (lifetimeS > 0) {
                    tempStorage.urls[url] = {
                        data: responseText,
                        date: Date.now(),
                        lifetime: lifetimeS
                    }
                    SetSessionStorage()
                }
                resolve(responseText);
                return
            })
        })
            .catch(error => {
                // Handle errors
                reject('Error fetching HTML:' + error);
                return
            });
    })
}

function SwipeNavigation() {
    if (!isMobile || !syncStorage.settings.swipeNavigationFF.value) return;
    if (document.getElementsByTagName("body").length != 0) {
        CreateSwipeDetector();
    }

    function CreateSwipeDetector() {
        const swipeDetector = new SwipeDetector(document.body, {
            minSwipeDistance: 100,  // minimum distance for a swipe (in pixels)
            maxVerticalDistance: 300,  // maximum allowed vertical movement (in pixels)
            maxSwipeTime: 600,  // maximum time for a swipe (in milliseconds)
            onSwipe: (direction) => {
                let link = [];
                if (direction == 'left') {
                    link = document.getElementsByClassName("next");
                } else {
                    link = document.getElementsByClassName("prev");
                }
                if (link.length != 0) {
                    /*document.addEventListener('visibilitychange', () => {
                        if (!document.hidden) {
                            document.body.style.transform = "translate(0vw)";
                        }
                    });*/
                    //document.body.style.overflow = "hidden"  // intended to hide the side bar. will reset scroll position to top.
                    /*if (direction == "left") {
                        document.body.style.transform = "translate(-160vw)";
                    } else {
                        document.body.style.transform = "translate(160vw)";
                    }*/
                    link[0].click()
                }
            }
        });
        document.body.style.transition = "transform 0.3s ease-in-out";
    }
}

class SwipeDetector {
    constructor(element, options = {}) {
        this.element = element;
        if (!this.element) {
            console.error('SwipeDetector: No valid element provided');
            return;
        }

        this.options = {
            minSwipeDistance: options.minSwipeDistance || 50,
            maxVerticalDistance: options.maxVerticalDistance || 30,
            maxSwipeTime: options.maxSwipeTime || 300
        };

        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.swipeStartTime = 0;

        this.onSwipe = options.onSwipe || (() => { });

        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        this.element.addEventListener('touchstart', this.handleTouchStart);
        this.element.addEventListener('touchend', this.handleTouchEnd);
    }

    handleTouchStart(event) {
        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.swipeStartTime = new Date().getTime();
    }

    handleTouchEnd(event) {
        this.touchEndX = event.changedTouches[0].clientX;
        this.touchEndY = event.changedTouches[0].clientY;
        this.detectSwipe();
    }

    detectSwipe() {
        const swipeTime = new Date().getTime() - this.swipeStartTime;
        const horizontalDistance = this.touchEndX - this.touchStartX;
        const verticalDistance = Math.abs(this.touchEndY - this.touchStartY);

        if (
            swipeTime < this.options.maxSwipeTime &&
            Math.abs(horizontalDistance) > this.options.minSwipeDistance &&
            verticalDistance < this.options.maxVerticalDistance
        ) {
            const direction = horizontalDistance > 0 ? 'right' : 'left';
            this.onSwipe(direction);
        }
    }

    destroy() {
        if (this.element) {
            this.element.removeEventListener('touchstart', this.handleTouchStart);
            this.element.removeEventListener('touchend', this.handleTouchEnd);
        }
    }
}

function SendNotification(text, thumbnailURL = null) {
    if (document.getElementById("notifications") == null) {
        let notificationsDiv = document.createElement("div");
        notificationsDiv.id = "notifications";
        notificationsDiv.classList.add("notifications");
        document.body.appendChild(notificationsDiv)
    }
    notificationID++;
    let notificationDiv = document.createElement("div");
    notificationDiv.id = "notificationDiv" + notificationID;
    notificationDiv.classList.add("notification-div");
    document.getElementById("notifications").appendChild(notificationDiv)
    notificationDiv.innerHTML = `
      <div class="notification" id="notification${notificationID}">
        <div class="notification-content">
          ${thumbnailURL == null ? '' : '<img class="notification-thumbnail" src="' + thumbnailURL + '">'}
          <p class="notification-text" id="notificationText${notificationID}">error</p>
          <p class="notification-dismiss" id="notificationDismiss${notificationID}">✕</p>
        </div>
        <div class="dismiss-bar-div" id="dismissBarDiv${notificationID}">
          <div class="dismiss-bar" id="dismissBar${notificationID}" style="width: 0%"></div>
        </div>
      </div>`
    setTimeout(() => {
        let notification = document.getElementById("notification" + notificationID)
        let notificationText = document.getElementById("notificationText" + notificationID);
        let dismissBar = document.getElementById("dismissBar" + notificationID);
        let dismiss = document.getElementById("notificationDismiss" + notificationID);
        dismiss.addEventListener("click", (() => {
            notification.parentElement.style = "height: 0px; margin-bottom: 0px;";
            setTimeout(() => {
                notificationDiv.remove();
                return;
            }, 300);
        }))
        notificationText.textContent = text;
        notification.parentElement.style = "height: 44px; margin-bottom: 15px;"
        dismissBar.style.width = "100%";
        setTimeout(() => {
            notification.parentElement.style = "height: 0px; margin-bottom: 0px;";
            setTimeout(() => {
                notificationDiv.remove();
                return;
            }, 300);
        }, 3000);
    }, 50);
}

function SetupIndexedDB(dbName, storeName) {
    return new Promise((resolve, reject) => {
        if (tempStorageDB != undefined) {
            resolve(tempStorageDB)
        }
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            console.log("Successfully opened IndexedDB")
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(`Error opening database: ${event.target.error}`);
        };
    });
}

async function SetItemInDB(db, storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        const request = store.put(data); // Use `.put(data)` to overwrite data with the same key
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(`Error saving data: ${event.target.error}`);
    });
}

async function GetItemFromDB(db, storeName, id = null) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);

        const request = id ? store.get(id) : store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(`Error retrieving data: ${event.target.error}`);
    });
}

async function resetIndexedDB(dbName) {
    return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);

        deleteRequest.onsuccess = () => {
            console.log(`Database '${dbName}' deleted successfully.`);
            resolve();
        };

        deleteRequest.onerror = (event) => {
            reject(`Error deleting database: ${event.target.error}`);
        };

        deleteRequest.onblocked = () => {
            console.warn(`Database '${dbName}' deletion is blocked. Close all tabs using it.`);
        };
    });
}

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