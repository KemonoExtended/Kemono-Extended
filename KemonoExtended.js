const { storage } = browser;
const { session } = browser.storage;
const browserStorage = browser.storage.local;
import ProgressBar from 'progressbar.js';

const isMobile = window.matchMedia("(pointer: coarse)").matches;
console.log(isMobile)

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

const regex = {
    // Regular expressions for ID extraction
    imageToIDRegex: /(?<=\/data\/\w+\/\w+\/)\w{7}(?=\w+\.\w+)/, // Finds ID in image link
    postToIDRegex: /(?<=\w+\/user\/[^/]+\/post\/)(\d+)/, // Finds ID in post link
    userToIDRegex: /(?<=\w+\/user\/)([^/]+)/, // Finds ID in user profile link

    // Regular Expressions for ID extraction on Discord servers
    servertoIDRegex: /(?<=discord\/server\/)\d{8}/, // Finds ID in Discord server URL
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
    urlExtractionRegex: /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
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


const extensionID = chrome.runtime.id;
let postID;
let notificationID = 0;
let restoredImages = 0;

// local DB copies
let syncStorage = {}; // not acually synchronous across devices, just persistent storage
let tempStorage = {};
//console.log(tempStorage)

FetchDB().then(() => { Main(); });

function Main() {
    RecieveSettingsUpdates();
    AddMouseTiltListener();
    if (isMobile && syncStorage.settings.swipeNavigationFF.value) {
        SwipeNavigation()
    }

    // if URL is a post page
    if (regex.postURLRegex.test(document.URL)) {
        SeePostFromPost();

        postID = document.URL.match(regex.postToIDRegex)[0];
        if (document.readyState === true) {
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
        CreateNodeObserver(
            (element) => { return element.classList.contains("user-header__actions"); },
            (element) => {
                element.classList.add("read-all-div");
                if (!isMobile) {
                    CreateSubscribeButton(element);
                    element.parentElement.parentElement.style.maxWidth = "800px";
                }
                CreateReadAllButton(element);
                let elements = element.children;
                for (let i = 0; i < elements.length; i++) {
                    elements[i].style = "margin-right: 0px;";
                }
            }, true);

        CreateNodeObserver(
            (element) => { return element.classList.contains("post-card__header"); },
            (element) => { CreateSeenBadge(element); }
        );

        const userID = document.URL.match(regex.userToIDRegex)[0];

        if (!syncStorage.postDB.hasOwnProperty(userID)) {
            syncStorage.postDB[userID] = {};
        }
        if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
            syncStorage.postDB[userID].data = {};
        }


        console.log(document.URL)
        const service = document.URL.match(regex.siteRegex)[0];
        const requestURL = `https://${service}.su/api/v1/creators.txt`
        console.log(requestURL)
        SendRequest(requestURL).then((dataString) => {
            let data = JSON.parse(dataString);
            console.log(data, dataString)
            let entry = data.find((element) => {
                return element.id == parseInt(userID)
            })
            FetchDB().then(() => {
                if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
                    syncStorage.postDB[userID].data = {};
                }
                syncStorage.postDB[userID].data.lastImportDate = DateToUnix(entry.last_imported);
                SetDB();
                browserStorage.set(syncStorage);
                browser.runtime.sendMessage({ type: "DBUpdate" });
            })
        });

        RestoreImages();

        RegularUpdatePosts()
    }

    // If URL is another page with posts
    else if (regex.otherRegex.test(document.URL)) {

        CreateNodeObserver(
            (element) => { return element.classList.contains("post-card__header"); },
            (element) => { CreateSeenBadge(element); }
        );

        RestoreImages();

        RegularUpdatePosts()
    }

    // If URL is a user browser
    else if (regex.userBrowserRegex.test(document.URL)) {
        console.log("user browser");
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
    if (!syncStorage.settings.subscriptionsFF.value) {
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
            SendNotification("Subscriped to " + name, profilePictureURL)
            let site = document.URL.match(regex.siteRegex)[0];
            let service = document.URL.match(regex.serviceRegex)[0];
            console.log(name)
            FetchDB().then(() => {
                syncStorage.subscribed[userID] = {}
                syncStorage.subscribed[userID].site = document.URL.match(regex.siteRegex)[0];
                syncStorage.subscribed[userID].service = document.URL.match(regex.serviceRegex)[0];
                syncStorage.subscribed[userID].creatorName = name;

                SetDB();
                browserStorage.set(syncStorage);
            })

            const apiURL = `https://${site}.su/api/v1/${service}/user/${userID}`;
            SendRequest(apiURL).then((dataString) => {
                const request = JSON.parse(dataString);
                if (request != null) {
                    FetchDB().then(() => {
                        syncStorage.subscribed[userID].lastPost = request[0].added;
                        SetDB();
                        browserStorage.set(syncStorage);
                    })
                }
            })

            subscribeButton.classList.add("subscribed");
            subscribeButton.textContent = "Subscribed";
        }
        SetDB();
        browserStorage.set(syncStorage);
    });
}

function CreateReadAllButton(parentNode) { //Adds subscription button on user pages
    parentNode.style.display = "flex"
    let readAllExisting = document.getElementById("readAllButton");
    if (readAllExisting) {
        // console.log("readAll button already exists, value = " + syncStorage.settings.readAllFF.value);
        if (syncStorage.settings.readAllFF.value) {
            readAllExisting.style.display = "block";
        }
        else {
            readAllExisting.style.display = "none";
        }
        return;
    }
    const readAllButton = document.createElement("button");
    let userID = document.URL.match(regex.userToIDRegex)[0];
    if (!syncStorage.postDB.hasOwnProperty(userID)) {
        syncStorage.postDB[userID] = {};
    }
    if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
        syncStorage.postDB[userID].data = {};
    }
    if (!syncStorage.postDB[userID].data.hasOwnProperty("readAllDate")) {
        syncStorage.postDB[userID].data.readAllDate = -1;
    }
    if (!syncStorage.postDB[userID].data.hasOwnProperty("lastPostAmount")) {
        syncStorage.postDB[userID].data.lastPostAmount = -1;
    }
    let postTags = document.getElementsByTagName("small")
    let postAmount;

    if (postTags == undefined || postTags.length == 0) {
        postAmount = document.getElementsByClassName("post-card post-card--preview").length;
    } else {
        postAmount = parseInt(postTags[0].textContent.match(regex.userPostAmountRegex)[0]);
    }

    // console.log(syncStorage.postDB[userID].data.lastPostAmount + " " + postAmount)
    if (syncStorage.postDB[userID].data.readAllDate == -1 || syncStorage.postDB[userID].data.lastPostAmount != postAmount) {
        readAllButton.classList.add("read-all");
        readAllButton.textContent = "Read All";
        readAllButton.id = "readAllButton";
    } else {
        readAllButton.classList.add("read-all");
        readAllButton.classList.add("undo");
        readAllButton.textContent = "Undo";
    }
    if (syncStorage.settings.readAllFF.value) {
        parentNode.appendChild(readAllButton);
    }

    SetDB();
    browserStorage.set(syncStorage);
    readAllButton.addEventListener("click", function () {
        ReadAll();
    });
}

function ReadAll() { //Sets a timestamp to the last read all date to now
    let userID = document.URL.match(regex.userToIDRegex)[0];
    let readAllButton = document.getElementsByClassName("read-all")[0];
    if (syncStorage.postDB[userID].data.readAllDate == -1 || !syncStorage.postDB[userID].data.hasOwnProperty("readAllDate")) {
        SendNotification("Read all posts")
        syncStorage.postDB[userID].data.readAllDate = Date.now();
        let postTags = document.getElementsByTagName("small")
        let lastPostAmount;

        if (postTags == undefined || postTags.length == 0) {
            lastPostAmount = document.getElementsByClassName("post-card post-card--preview").length;
        } else {
            lastPostAmount = parseInt(postTags[0].textContent.match(regex.userPostAmountRegex)[0]);
        }
        console.log(lastPostAmount);
        syncStorage.postDB[userID].data.lastPostAmount = lastPostAmount;
        SetDB();
        browserStorage.set(syncStorage);
        console.log(syncStorage)
        readAllButton.classList.add("undo");
        readAllButton.textContent = "Undo";
    } else {
        SendNotification("Unread all posts")
        syncStorage.postDB[userID].data.readAllDate = -1;
        SetDB();
        browserStorage.set(syncStorage);
        readAllButton.classList.remove("undo");
        readAllButton.textContent = "Read All";
    }
    let postElements = document.getElementsByClassName("post-card__header");
    for (let i = 0; i < postElements.length; i++) {
        CreateSeenBadge(postElements[i]);
    }
}

function CreateSeenBadge(postElement) { //Creates a badge and style for posts that have been seen or read previously
    // console.log(postElement)
    if (!syncStorage.settings.readPostsFF.value) {
        return;
    }
    let userID = postElement.parentElement.href.match(regex.userToIDRegex)[0];
    if (!syncStorage.postDB.hasOwnProperty(userID)) {
        syncStorage.postDB[userID] = {};
    }

    let readAllUnix = -1;
    if (!syncStorage.postDB[userID].hasOwnProperty("data")) {
        syncStorage.postDB[userID].data = {};
    }
    else if (syncStorage.postDB[userID].data.hasOwnProperty("readAllDate")) {
        readAllUnix = syncStorage.postDB[userID].data.readAllDate;
    }
    const postID = postElement.parentElement.href.match(regex.postToIDRegex)[0];
    let postDate = postElement.parentElement.getElementsByClassName("timestamp")[0].dateTime;
    let postUnix = DateToUnix(postDate);
    let readAll = false;
    if (readAllUnix != -1) {
        if (readAllUnix >= postUnix) {
            readAll = true;
        }
    }
    if (syncStorage.postDB[userID].hasOwnProperty(postID) || readAll) {
        console.log(postElement.parentElement.getElementsByClassName("post-card__image-container"));
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
        if (seenBadges.length == 0) {
            let seenBadge = document.createElement("p");
            seenBadge.classList.add("seen-badge");
            if (syncStorage.postDB[userID].hasOwnProperty(postID)) {
                seenBadge.textContent = "Read";
            } else {
                seenBadge.textContent = "Seen";
            }
            postElement.parentElement.appendChild(seenBadge);
        } else if (syncStorage.postDB[userID].hasOwnProperty(postID)) {
            seenBadges[0].textContent = "Read";
        }
    } else if (postElement.parentElement.getElementsByClassName("seen-badge").length > 0) {
        postElement.nextElementSibling.classList.remove("seen-post");
        let seenBadge = postElement.parentElement.getElementsByClassName("seen-badge");
        if (seenBadge.length > 0) {
            seenBadge[0].remove();
        }
    }
}

function AddUnreadBadges() { // adds a badge to user browsers which indicates which of the users, if favorited, has posts that are new
    if (!syncStorage.settings.unreadDotFF.value) {
        return;
    }
    GetSessionStorage()
    console.log("tempstorage: " + tempStorage)

    let service = document.location.href.match(regex.siteRegex)[0];
    console.log(service)
    SendRequest(`https://${service}.su/api/v1/creators.txt`).then((dataString) => {
        let data = JSON.parse(dataString);
        console.log(data)
        let profiles = document.getElementsByClassName("user-card")
        for (let i = 0; i < profiles.length; i++) {
            let entry = data.find((element) => {
                return element.id == profiles[i].href.match(regex.userToIDRegex)[0];
            })
            if (syncStorage.postDB.hasOwnProperty(entry.id)) {
                if (!syncStorage.postDB[entry.id].data.hasOwnProperty("lastImportDate")) {
                    syncStorage.postDB[entry.id].data.lastImportDate = -1;
                } else {
                    console.log(syncStorage.postDB[entry.id].data.lastImportDate, DateToUnix(entry.last_imported))
                    let lastImportDate = syncStorage.postDB[entry.id].data.lastImportDate;
                    let hasUnreadPosts = DateToUnix(entry.last_imported) != lastImportDate;

                    if (hasUnreadPosts && !profiles[i].classList.contains("new-posts-user")) {
                        console.warn(DateToUnix(entry.last_imported), lastImportDate)
                        console.log(profiles[i])
                        let unreadDot = document.createElement("div");
                        unreadDot.classList.add("new-posts")
                        profiles[i].appendChild(unreadDot);
                        profiles[i].classList.add("new-posts-user")
                    } else if (!hasUnreadPosts && profiles[i].classList.contains("new-posts-user")) {
                        profiles[i].classList.remove("new-posts-user")
                        profiles[i].removeChild(profiles[i].getElementsByClassName("new-posts")[0])
                    }
                }
            }
        }
        CreateNodeObserver(
            (element) => {
                return element.class == "user-card"
            },
            (element) => {
                let entry = data.find((element1) => {
                    return element1.id == element.dataset.id
                })
                if (syncStorage.postDB.hasOwnProperty(entry.id)) {
                    if (!syncStorage.postDB[entry.id].data.hasOwnProperty("lastImportDate")) {
                        syncStorage.postDB[entry.id].data.lastImportDate = -1;
                    }
                    let lastImportDate = syncStorage.postDB[entry.id].data.lastImportDate;
                    if (DateToUnix(entry.last_imported) != lastImportDate) {
                        console.warn(DateToUnix(entry.last_imported), lastImportDate)
                        console.log(element)
                        let unreadDot = document.createElement("div");
                        unreadDot.classList.add("new-posts")
                        element.appendChild(unreadDot);
                        element.classList.add("new-posts-user")
                    }
                }
            })
    })
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
    let imageURL = element.href; // colletion of links for full size images
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
    downloadDiv.addEventListener("click", () => {
        console.log(downloadDiv)
        QueDownload(imageURL, downloadDiv, thumbnailURL);
    });
}

function QueDownload(url, downloadDiv, thumbnailURL) {
    const downloadIcon = downloadDiv.children[0];

    if (downloadIcon.nextElementSibling == null || downloadIcon.nextElementSibling.children.length == 0) { //download is not running
        console.log("download not running")
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
        console.log(isMobile);
        let cancelButton = document.createElement("div");
        cancelButton.classList.add("download-cancel");
        downloadIcon.parentElement.appendChild(cancelButton);
        if (isMobile) {
            console.log("Downloading " + url);
            cancelButton.style.opacity = 1;
            MobileDownload(url, (progress) => {
                statusCircle.animate(Math.max(progress / 100, 0.01));
                console.log(progress)
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
                        console.log("test");
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
                        console.log(request.progress);
                        statusCircle.animate(Math.max(request.progress / 100, 0.01))
                    } else if (request.status == "download-complete") {
                        statusCircle.animate(1);
                        cancelButton.style.opacity = 0;
                        setTimeout(() => { cancelButton.remove(); }, 200);
                        setTimeout(() => {
                            console.log("test");
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
                            console.log("test");
                            downloadIcon.classList = ["download"];
                            downloadIcon.style.opacity = 1
                            downloadIcon.nextElementSibling.style.opacity = 0;
                            setTimeout(() => {
                                statusCircle.destroy();
                                statusCircles.splice(statusCircles.indexOf({ url: url, statusCircle: statusCircle }), 1);
                            }, 200);
                        }, 500)
                    }
                } else {
                    console.log(request);
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
            console.log("test");
            downloadIcon.classList = ["download"];
            downloadIcon.style.opacity = 1
            downloadIcon.nextElementSibling.style.opacity = 0;
            setTimeout(() => {
                let ssindex = statusCircles.findIndex((element) => element.url == url)
                statusCircles.splice(ssindex, 1);
                statusCircle.destroy();
            }, 100);
        }, 500)

        if (isMobile) {
            console.log(activeMobileDownloads);
            let fetchEntry = activeMobileDownloads.find((element) => (element.url == url));
            if (fetchEntry != undefined) {
                console.log(fetchEntry.controller);
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
                location.href = linkRight[0].href;
            }
        } else {
            let linkLeft = document.getElementsByClassName("prev");
            if (linkLeft.length > 0) {
                location.href = linkLeft[0].href;
            }
        }
    }
}

function AddMouseTiltListener() {
    // Add wheel event listener
    if ("onwheel" in document) {
        // Modern browsers support the 'wheel' event
        document.addEventListener("wheel", HandleWheelTilt);
    } else {
        // Legacy browsers support the 'mousewheel' event
        document.addEventListener("mousewheel", HandleWheelTilt);
    }
}

function RestoreImages() {
    if (!syncStorage.settings.restoreThumbnailsFF.value) {
        return
    }
    GetSessionStorage();
    CreateNodeObserver(
        (element) => {
            return element.tagName == "A" &&
                element.hasAttribute("href") &&
                element.parentElement.classList.contains("post-card--preview") &&
                element.getElementsByClassName("post-card__image").length == 0
        },
        (element) => {
            RestoreImage(element)
        }
    )
    let elements = document.querySelectorAll('a[href]:not(:has(.post-card__image)):is(.post-card--preview > a)');
    elements.forEach(element => {
        RestoreImage(element)
    });
}

function RestoreImage(element) {
    // console.log(element)
    let postUserID = element.href.match(regex.userToIDRegex)[0];
    let postID = element.href.match(regex.postToIDRegex)[0];

    if (tempStorage.postDB.hasOwnProperty(postUserID) && tempStorage.postDB[postUserID].hasOwnProperty(postID) && false) {
        let entry = tempStorage.postDB[postUserID][postID];
        CreateThumbnail(element, entry.content, entry.type);
    } else {
        restoredImages++;
        setTimeout(() => {
            RequestRestoreImage(element).then((data) => {

                let imageFormats = ["png", "jpg", "jpeg", "webp", "gif"]
                let videoFormats = ["mp4", "webm", "mkv", "avi", "m4v"]
                let thumbnail = { image: undefined, video: undefined };


                try {
                    console.log(element, data[0].content)
                    const parser = new DOMParser();
                    let contentDOM = parser.parseFromString(data[0].content, 'text/html')
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
                        let fileExtension = data[0].file.path.match(regex.fileExtensionRegex)[0]
                        if (imageFormats.includes(fileExtension)) {
                            thumbnail.image = [data[0].file.path]

                        }
                        if (thumbnail.image == undefined && thumbnail.video == undefined) {
                            if (videoFormats.includes(fileExtension)) {
                                thumbnail.video = [data[0].file.path]
                            }
                        }
                    } catch { };
                }


                if (thumbnail.image == undefined)
                    try {
                        thumbnail.image = data[0].attachments.find((element) =>
                            imageFormats.includes(element.path.match(regex.fileExtensionRegex)[0]))
                            .map(element => element.path)

                        if (thumbnail.image == undefined && thumbnail.video == undefined) {
                            thumbnail.video = data[0].attachments.find((element) =>
                                videoFormats.includes(element.path.match(regex.fileExtensionRegex)[0]))
                                .map(element => element.path)
                        }
                    } catch { }

                console.log(thumbnail)

                tempStorage.postDB[postUserID] = {};
                tempStorage.postDB[postUserID][postID] = {};

                if (thumbnail.image != undefined) {
                    GetSessionStorage();
                    tempStorage.postDB[postUserID][postID] = { type: "image", content: thumbnail.image }
                    SetSessionStorage();

                    CreateThumbnail(element, thumbnail.image, "image");
                }

                else if (thumbnail.video != undefined) {
                    GetSessionStorage();
                    tempStorage.postDB[postUserID][postID] = { type: "video", content: thumbnail.video }
                    SetSessionStorage();

                    CreateThumbnail(element, thumbnail.video, "video");
                }

                else {
                    GetSessionStorage();
                    tempStorage.postDB[postUserID][postID] = { type: "text", content: data[0] }
                    SetSessionStorage();

                    CreateThumbnail(element, data[0], "text");
                }
            })
        }, restoredImages * 800)
    }
}

function RequestRestoreImage(element) {
    return new Promise((resolve) => {
        const href = element.href
        const urlMatches = href.match(regex.postToApiRegex);
        const apiURL = urlMatches[1] + "/api/v1" + urlMatches[2];
        SendRequest(apiURL).then((data) => {
            const request = JSON.parse(data);
            if (request != null) {
                resolve([request, apiURL])
            }
            resolve(undefined);
        })
    })
}

function CreateThumbnail(element, content, type) {
    if (type == "image" || type == "video") {
        //console.log(content)
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

function RegularUpdatePosts() {
    browser.runtime.onMessage.addListener((request) => {
        if (request.type == "DBUpdate") {
            FetchDB().then(() => {
                console.log(syncStorage)
                const postElements = document.getElementsByClassName("post-card__header");
                for (let i = 0; i < postElements.length; i++) {
                    CreateSeenBadge(postElements[i]);
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
                        CreateSeenBadge(postElements[i]);
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
    sessionStorage.setItem("cache", JSON.stringify(tempStorage))
}

function GetSessionStorage() {
    tempStorage = JSON.parse(sessionStorage.getItem("cache"));
    if (tempStorage == null) {
        tempStorage = { postDB: {} };
    }
    if (!tempStorage.hasOwnProperty("postDB")) {
        tempStorage.postDB = {}
    }
    //console.log(sessionStorage)
    SetSessionStorage()
}

function RecieveSettingsUpdates() {
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
                        console.log(seenBadges, seenPosts)
                        for (let i = 0; i < seenBadgesLength; i++) {
                            console.log(i)
                            seenBadges[0].remove();
                        }
                        for (let i = 0; i < seenPostsLength; i++) {
                            seenPosts[0].classList.remove("seen-post");
                        }
                    }
                    let posts = document.getElementsByClassName("post-card__header")
                    for (let i = 0; i < posts.length; i++) {
                        CreateSeenBadge(posts[i]);
                    }
                }
                else if (request.setting == "readAllFF") {
                    CreateReadAllButton();
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
                        console.log(profiles)
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

function SendRequest(url) {
    return new Promise((resolve, reject) => {
        let service = url.match(regex.siteRegex)[0];
        if (url == `https://${service}.su/api/v1/creators.txt`) {
            GetSessionStorage()
            if (!tempStorage.hasOwnProperty("urls")) {
                tempStorage.urls = { artists: { kemono: { data: null, date: 0 }, coomer: { data: null, date: 0 } } }
                SetSessionStorage()
            }
            else if (Date.now() - tempStorage.urls.artists[service].date < 0) { // update every 10 minutes
                resolve(tempStorage.urls.artists[service].data)
            }
        }
        console.log("Sending request to " + url);
        let before = Date.now();
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                console.log("request to " + url + " took " + (Date.now() - before) / 1000 + " seconds")
                if (url == `https://${service}.su/api/v1/creators.txt` && response.length > 0) {
                    tempStorage.urls.artists[service].data = response
                    tempStorage.urls.artists[service].date = Date.now()
                }
                SetSessionStorage()
                resolve(response.text());
            })
            .catch(error => {
                // Handle errors
                console.error('Error fetching HTML:', error);
                reject(null);
            });
    })
}

function SwipeNavigation() {
    if (!isMobile || !syncStorage.settings.swipeNavigationFF.value) return;
    CreateNodeObserver((element) => { return element == document.body }, () => {
        CreateSwipeDetector();
    });
    if (document.getElementsByTagName("body").length != 0) {
        CreateSwipeDetector();
    }

    function CreateSwipeDetector() {
        const swipeDetector = new SwipeDetector(document.body, {
            minSwipeDistance: 100,  // minimum distance for a swipe (in pixels)
            maxVerticalDistance: 300,  // maximum allowed vertical movement (in pixels)
            maxSwipeTime: 600,  // maximum time for a swipe (in milliseconds)
            onSwipe: (direction) => {
                console.log("swiped: " + direction)
                let link = [];
                if (direction == 'left') {
                    link = document.getElementsByClassName("next");
                } else {
                    link = document.getElementsByClassName("prev");
                }
                if (link.length != 0) {
                    document.addEventListener('visibilitychange', () => {
                        if (!document.hidden) {
                            document.body.style.transform = "translate(0vw)";
                        }
                    });
                    //document.body.style.overflow = "hidden"  // intended to hide the side bar. will reset scroll position to top.
                    if (direction == "left") {
                        document.body.style.transform = "translate(-160vw)";
                    } else {
                        document.body.style.transform = "translate(160vw)";
                    }
                    window.location.href = link[0].href
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