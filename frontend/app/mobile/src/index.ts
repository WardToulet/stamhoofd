// Load icon font
require('@stamhoofd/assets/images/icons/icons.font');

import { App as CApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { HistoryManager } from '@simonbackx/vue-app-navigation';
import { VueGlobalHelper } from '@stamhoofd/components';
import { I18nController } from '@stamhoofd/frontend-i18n';
// import smoothscroll from 'smoothscroll-polyfill';
import Vue from "vue";
import VueMeta from 'vue-meta'

import { AppManager, Storage } from '../../../shared/networking';
// Kick off the app
import App from "../../dashboard/src/App.vue";
import { CapacitorStorage } from './CapacitorStorage';
import QRScanner from './QRScannerPlugin';
import { WrapperHTTPRequest } from './WrapperHTTPRequest';

Vue.use(VueMeta)

const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    return function(height: number) {
        const context = this;
        // eslint-disable-next-line prefer-rest-params
        const args = arguments;
        if (lastRan) {
            clearTimeout(lastFunc);
        }
        lastRan = Date.now();
            
        lastFunc = setTimeout(function() {
            if (Date.now() - lastRan >= limit) {
                func.apply(context, args);
                lastRan = Date.now();
            }
        }, limit - (Date.now() - lastRan));
    };
};

function setKeyboardHeight(height: number) {
    document.documentElement.style.setProperty("--keyboard-height", `${height}px`);
    if (height > 0 && Capacitor.getPlatform() === 'android') {
        requestAnimationFrame(() => {
            document.activeElement?.scrollIntoView({ behavior: 'smooth', block: "center", inline: "center" });
        });
    }
}

const throttledSetKeyboardHeight = throttle(setKeyboardHeight, 100)

// Implement smooth keyboard behavior on both iOS and Android instead of the bad default handling
if (Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android') {
    AppManager.shared.platform = Capacitor.getPlatform() as "android" | "ios" | "web"

    // Force set margin of navigation bar (disable jumping when scrolling which is only needed on webistes)
    document.documentElement.style.setProperty("--navigation-bar-margin", `0px`);

    // note: for this to work on android, android:windowSoftInputMode="adjustPan" is needed in the activity (manifest)
    // kick off the polyfill!
    //

    if (Capacitor.getPlatform() === 'ios') {
        //StatusBar.setStyle({ style: Style.Light }).catch(e => console.error(e));

        // Disable swipe back animations (or they will play twice)
        HistoryManager.animateHistoryPop = false;

        // Use the iOS scanning plugin
        AppManager.shared.QRScanner = QRScanner
    }

    Keyboard.addListener('keyboardWillShow', info => {
        //console.log('keyboard will show with height:', info.keyboardHeight, info);
        throttledSetKeyboardHeight(info.keyboardHeight)
        /*document.documentElement.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
        requestAnimationFrame(() => {
            document.activeElement?.scrollIntoView({ behavior: 'smooth', block: "start", inline: "center" });
        });*/
    }).catch(e => console.error(e));

    Keyboard.addListener('keyboardDidShow', info => {
        //console.log('keyboard did show with height:', info.keyboardHeight, info);
    }).catch(e => console.error(e));

    Keyboard.addListener('keyboardWillHide', () => {
        //console.log('keyboard will hide');
        throttledSetKeyboardHeight(0)
    }).catch(e => console.error(e));
}

// Faster click handling
// eslint-disable-next-line @typescript-eslint/no-empty-function
window.addEventListener("touchstart", () => { }, { passive: true });

// Plausible placeholder
(window as any).plausible = function() {
    //console.log("Debug plausible with args ", arguments)
}

// Override XMLHttpRequest in some situation (S&GV) since we don't have domain here
AppManager.shared.overrideXMLHttpRequest = WrapperHTTPRequest
const i18n = I18nController.getI18n()
I18nController.addUrlPrefix = false

VueGlobalHelper.setup()
Vue.prototype.$isMobile = true

const app = new Vue({
    i18n,
    render: (h) => h(App),
}).$mount("#app");

(window as any).app = app;

CApp.addListener('appUrlOpen', (data: any) => {
    console.log("Open app url location:", data)
    const url = new URL(data.url);
    window.location.href = url.pathname + url.search
    console.log(url.pathname + url.search)
}).catch(console.error);

// Replace default storage mechanism for some things
Storage.secure = new CapacitorStorage()
Storage.keychain = new CapacitorStorage()

AppManager.shared.hapticError = () => {
    Haptics.notification({ type: NotificationType.Error }).catch(console.error);
}

AppManager.shared.hapticWarning = () => {
    Haptics.notification({ type: NotificationType.Warning }).catch(console.error);
}

AppManager.shared.hapticSuccess = () => {
    Haptics.notification({ type: NotificationType.Success }).catch(console.error);
}

AppManager.shared.hapticTap = () => {
    Haptics.notification({ type: NotificationType.Success }).catch(console.error);
}

window.addEventListener('statusTap',  () => {
    console.log("Status tapped")
    const element = document.querySelector(".st-view > main") as HTMLElement
    if (element) {
        // Smooth scroll has just landed in Safari TP, we'll wait a bit before we implement it here

        // Scroll to top
        // Stop current scroll acceleration before initiating a new one
        
        const duration = 300 // ms
        let start: number
        let previousTimeStamp: number
        const startPosition = element.scrollTop
        const endPosition = 0
        let previousPosition = element.scrollTop

        element.style.willChange = "scroll-position";
        (element.style as any).webkitOverflowScrolling = "auto"
        element.style.overflow = "hidden"

        // animate scrollTop of element to zero
        const step = function (timestamp) {
            if (start === undefined) {
                start = timestamp;

            }
            const elapsed = timestamp - start;

            if (element.scrollTop !== previousPosition && start !== timestamp){
                // The user has scrolled the page: stop animation
                element.style.overflow = ""
                element.style.willChange = "";
                (element.style as any).webkitOverflowScrolling = ""
                return
            }

            if (previousTimeStamp !== timestamp) {
                // Math.min() is used here to make sure the element stops at exactly 200px
                element.scrollTop = Math.round((startPosition - endPosition) * (duration - elapsed) / duration + endPosition)
                element.style.overflow = ""
            }

            if (elapsed < duration) { // Stop the animation after 2 seconds
                previousTimeStamp = timestamp
                previousPosition = element.scrollTop
                window.requestAnimationFrame(step);
            } else {
                element.style.overflow = ""
                element.style.willChange = "";
                (element.style as any).webkitOverflowScrolling = ""
            }
        }

        window.requestAnimationFrame(step);
    }
});