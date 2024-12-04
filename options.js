const { storage } = browser;
const { session } = browser.storage;
const browserStorage = browser.storage.local;
let isMobile = /android|mobile/i.test(navigator.userAgent)
console.log("Mobile device: " + isMobile)
let syncStorage = {};

let settingsDefaults = {
    restoreThumbnailsFF: { value: true, pc: true, mobile: true, description: "Restore post thumbnails", explanation: 'Restores thumbnails of posts when no thumbnail exists. If the post contains no images, the content of the post itself is displayed instead.' },
    readPostsFF: { value: true, pc: true, mobile: true, description: "Mark visited posts", explanation: 'Add a "read" badge to visited posts.' },
    downloaderFF: { value: true, pc: true, mobile: true, description: "Image downloader", explanation: 'Add a download button to the corner of images.' },
    unreadDotFF: { value: true, pc: true, mobile: true, description: "Unread markers in favorites", explanation: 'Highlight users with new posts in your favorites.' },
    subscriptionsFF: { value: true, pc: true, mobile: false, description: "Subscriptions", explanation: 'Enables the subscription system. this adds a "subscribe" button to user pages. It also allows the extension to check for new posts in the background and to notify you of them with system notifications.' },
    wheelTiltFF: { value: true, pc: true, mobile: false, description: "Mouse wheel navigation", explanation: 'Use tilting of the mouse wheel for navigation.' },
    swipeNavigationFF: { value: true, pc: false, mobile: true, description: "Swipe navigation", explanation: 'Allows navigation with swipe gestures.' }
}


if (isMobile) {
    CreateNodeObserver((element) => element.id == "settings", (element) => element.style.maxHeight = "unset", true);
}

let glowy = document.getElementsByClassName("glowy");
TitleAnimation();

function TitleAnimation() {
    CreateNodeObserver((element) => { return element.classList.contains("glowy") }, (element) => {
        if (isMobile) {
            element.style.opacity = "1"
        }
    }, true)
    if (!isMobile) {
        document.addEventListener('mousemove', function (event) {
            for (let i = 0; i < glowy.length; i++) {
                let element = glowy[i]
                // Get the element's position
                const rect = element.getBoundingClientRect();
                const elementX = rect.left + rect.width / 2;  // Element's center X position
                const elementY = rect.top + rect.height / 2;  // Element's center Y position

                // Get the cursor's position
                const cursorX = event.clientX;
                const cursorY = event.clientY;

                // Calculate the distance using the Pythagorean theorem
                const distance = Math.sqrt(Math.pow(elementX - cursorX, 2) + Math.pow(elementY - cursorY, 2));
                let textShadowOpacity = Math.min(Math.max((1 - distance / 15) + 0.5, 0), 0.2)
                element.setAttribute("style", `opacity: ${Math.min(Math.max((1 - distance / 40) + 0.5, 0.3), 1)};
                text-shadow: 
			    0 0 5px rgba(255, 255, 255, ${textShadowOpacity}),
			    0 0 10px rgba(255, 255, 255, ${textShadowOpacity}),
			    0 0 15px rgba(255, 255, 255, ${textShadowOpacity}),
			    0 0 20px rgba(255, 255, 255, ${textShadowOpacity}),
			    0 0 25px rgba(255, 255, 255, ${textShadowOpacity})`);
            }
        });
    }
}

if (isMobile) {
    document.documentElement.style.minWidth = "unset";
    document.documentElement.style.minHeight = "unset";
}

CreateNodeObserver((element) => { return element.id == "settings" }, (settingsDiv) => {
    CreateSettingsEntries(settingsDiv)
}, true);

function CreateSettingsEntries(settingsDiv) {
    FetchDB().then(() => {
        Object.keys(syncStorage.settings).forEach((key) => {
            const setting = syncStorage.settings[key];
            console.log(syncStorage.settings, key, setting)
            let locked = (!setting.mobile && isMobile) || !setting.pc && !isMobile;
            console.log(setting, isMobile, locked)
            settingsDiv.insertAdjacentHTML(`beforeend`,
                `<div class="yn-options ${locked ? "yn-options-locked" : ""}" title="${setting.explanation.replace(/"/g, "&quot;")}" id="${key}">
                        <div class="yn-container" > 
                            <input type="checkbox" class="yn-checkbox" id="${key}_checkbox" ${locked ? 'style="pointer-events: none;"' : ''} ${setting.value && !locked ? 'checked=\"\"' : ''} ${locked ? 'disabled=""' : ''}>
                            <p class="yn-text ${locked ? "yn-text-locked" : ""}">
                            ${setting.description}
                            </p>
                        </div>
                        <div class="help-div" ${isMobile ? 'style="opacity: 1;"' : ''} id="${key}_helpDiv">
                            <p class="help" id="${key}_help">
                                ?
                            </p>
                        </div>
                </div>`);

            document.getElementById(key).addEventListener("click", () => {
                if (!locked) {
                    CheckBox(key)
                } else {
                    SendNotification(`Not available on ${isMobile ? "mobile" : "desktop"}.`)
                }
            })
            document.getElementById(key + "_helpDiv").addEventListener("click", (event) => {
                event.stopPropagation();
                infoPopup(key)
            })
        })
    })
}

CreateNodeObserver((element) => { return (element.classList.contains("action-button") || element.classList.contains("export-import-button")) }, (actionButton) => {
    actionButton.addEventListener("click", () => {
        if (actionButton.id == "clearSettings") {
            syncStorage.settings = settingsDefaults;
            SetDB();
            FetchDB().then(() => {
                let settingsDiv = document.getElementById("settings");
                settingsDiv.innerHTML = "";
                CreateSettingsEntries(settingsDiv)
                browser.runtime.sendMessage({ type: "settingsUpdate" });
                SendNotification("Reset settings")
            })
        } else if (actionButton.id == "clearPosts") {
            FetchDB().then(() => {
                syncStorage.postDB = {};
                SetDB();
                browser.runtime.sendMessage({ type: "DBUpdate" });
                SendNotification("Reset post storage")
            })
        } else if (actionButton.id == "exportSettings") {

        } else if (actionButton.id == "importSettings") {
            actionButton.addEventListener("click", () => { importSettings() })
        }
    })
});

function importSettings() {
    const filePicker = document.getElementById("importFilePicker")
    console.log(filePicker)
    filePicker.click()
}

CreateNodeObserver((element) => { return element.classList.contains("dismiss") }, (dismissButton) => {
    dismissButton.addEventListener("click", () => {
        infoPopup()
    })
}, true);

function infoPopup(id = undefined) {
    let popupDiv = document.getElementById("popupDiv");
    let content = document.getElementById("contentDiv");
    if (id != undefined) {
        popupDiv.classList.remove("popup-hidden");
        let popupHeader = document.getElementById("popupHeader");
        let popupText = document.getElementById("popupText");
        popupHeader.textContent = syncStorage.settings[id].description;
        popupText.textContent = syncStorage.settings[id].explanation;
        content.classList.add("content-hidden")
    } else {
        popupDiv.classList.add("popup-hidden");
        content.classList.remove("content-hidden");
    }
}

CreateNodeObserver((element) => element.id == "dismiss-bar-div", ((element) => {
}))

function CheckBox(flag, value = undefined, direction = undefined) {
    const setting = syncStorage.settings[flag];
    let checkbox = document.getElementById(flag + "_checkbox");

    if (value == undefined) {
        setting.value = !setting.value;
        checkbox.checked = setting.value;
    } else {
        checkbox.checked = value;
        setting.value = value;
    }

    if (setting.hasOwnProperty("children") && !checkbox.checked && direction != "up") {
        setting.children.forEach((child) => {
            CheckBox(child, false, "down")
        })
    }

    if (setting.hasOwnProperty("parents") && checkbox.checked && direction != "down") {
        setting.parents.forEach((parent) => {
            CheckBox(parent, true, "up")
        })
    }
    syncStorage.settings[flag] = setting;
    browserStorage.set(syncStorage);
    console.log(syncStorage)
    browser.tabs.query({ url: "*://*.kemono.su/*" || "*://*.coomer.su/*" }).then((tabs) => {
        tabs.forEach((tab) => {
            browser.tabs.sendMessage(tab.id, { type: "settingsUpdate", setting: flag, value: setting.value });
        });
    });
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

let notificationID = 0;


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