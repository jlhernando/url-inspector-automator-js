"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AndroidWebView = exports.AndroidSocket = exports.AndroidDevice = exports.Android = void 0;
const fs = require("fs");
const util = require("util");
const utils_1 = require("../utils/utils");
const events_1 = require("./events");
const browserContext_1 = require("./browserContext");
const channelOwner_1 = require("./channelOwner");
const timeoutSettings_1 = require("../utils/timeoutSettings");
const waiter_1 = require("./waiter");
const events_2 = require("events");
class Android extends channelOwner_1.ChannelOwner {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._timeoutSettings = new timeoutSettings_1.TimeoutSettings();
    }
    static from(android) {
        return android._object;
    }
    setDefaultTimeout(timeout) {
        this._timeoutSettings.setDefaultTimeout(timeout);
        this._channel.setDefaultTimeoutNoReply({ timeout });
    }
    async devices() {
        return this._wrapApiCall('android.devices', async () => {
            const { devices } = await this._channel.devices();
            return devices.map(d => AndroidDevice.from(d));
        });
    }
}
exports.Android = Android;
class AndroidDevice extends channelOwner_1.ChannelOwner {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._webViews = new Map();
        this.input = new Input(this);
        this._timeoutSettings = new timeoutSettings_1.TimeoutSettings(parent._timeoutSettings);
        this._channel.on('webViewAdded', ({ webView }) => this._onWebViewAdded(webView));
        this._channel.on('webViewRemoved', ({ pid }) => this._onWebViewRemoved(pid));
    }
    static from(androidDevice) {
        return androidDevice._object;
    }
    _onWebViewAdded(webView) {
        const view = new AndroidWebView(this, webView);
        this._webViews.set(webView.pid, view);
        this.emit(events_1.Events.AndroidDevice.WebView, view);
    }
    _onWebViewRemoved(pid) {
        const view = this._webViews.get(pid);
        this._webViews.delete(pid);
        if (view)
            view.emit(events_1.Events.AndroidWebView.Close);
    }
    setDefaultTimeout(timeout) {
        this._timeoutSettings.setDefaultTimeout(timeout);
        this._channel.setDefaultTimeoutNoReply({ timeout });
    }
    serial() {
        return this._initializer.serial;
    }
    model() {
        return this._initializer.model;
    }
    webViews() {
        return [...this._webViews.values()];
    }
    async webView(selector, options) {
        const webView = [...this._webViews.values()].find(v => v.pkg() === selector.pkg);
        if (webView)
            return webView;
        return this.waitForEvent('webview', {
            ...options,
            predicate: (view) => view.pkg() === selector.pkg
        });
    }
    async wait(selector, options) {
        await this._wrapApiCall('androidDevice.wait', async () => {
            await this._channel.wait({ selector: toSelectorChannel(selector), ...options });
        });
    }
    async fill(selector, text, options) {
        await this._wrapApiCall('androidDevice.fill', async () => {
            await this._channel.fill({ selector: toSelectorChannel(selector), text, ...options });
        });
    }
    async press(selector, key, options) {
        await this.tap(selector, options);
        await this.input.press(key);
    }
    async tap(selector, options) {
        await this._wrapApiCall('androidDevice.tap', async () => {
            await this._channel.tap({ selector: toSelectorChannel(selector), ...options });
        });
    }
    async drag(selector, dest, options) {
        await this._wrapApiCall('androidDevice.drag', async () => {
            await this._channel.drag({ selector: toSelectorChannel(selector), dest, ...options });
        });
    }
    async fling(selector, direction, options) {
        await this._wrapApiCall('androidDevice.fling', async () => {
            await this._channel.fling({ selector: toSelectorChannel(selector), direction, ...options });
        });
    }
    async longTap(selector, options) {
        await this._wrapApiCall('androidDevice.longTap', async () => {
            await this._channel.longTap({ selector: toSelectorChannel(selector), ...options });
        });
    }
    async pinchClose(selector, percent, options) {
        await this._wrapApiCall('androidDevice.pinchClose', async () => {
            await this._channel.pinchClose({ selector: toSelectorChannel(selector), percent, ...options });
        });
    }
    async pinchOpen(selector, percent, options) {
        await this._wrapApiCall('androidDevice.pinchOpen', async () => {
            await this._channel.pinchOpen({ selector: toSelectorChannel(selector), percent, ...options });
        });
    }
    async scroll(selector, direction, percent, options) {
        await this._wrapApiCall('androidDevice.scroll', async () => {
            await this._channel.scroll({ selector: toSelectorChannel(selector), direction, percent, ...options });
        });
    }
    async swipe(selector, direction, percent, options) {
        await this._wrapApiCall('androidDevice.swipe', async () => {
            await this._channel.swipe({ selector: toSelectorChannel(selector), direction, percent, ...options });
        });
    }
    async info(selector) {
        return await this._wrapApiCall('androidDevice.info', async () => {
            return (await this._channel.info({ selector: toSelectorChannel(selector) })).info;
        });
    }
    async tree() {
        return await this._wrapApiCall('androidDevice.tree', async () => {
            return (await this._channel.tree()).tree;
        });
    }
    async screenshot(options = {}) {
        return await this._wrapApiCall('androidDevice.screenshot', async () => {
            const { binary } = await this._channel.screenshot();
            const buffer = Buffer.from(binary, 'base64');
            if (options.path)
                await util.promisify(fs.writeFile)(options.path, buffer);
            return buffer;
        });
    }
    async close() {
        return this._wrapApiCall('androidDevice.close', async () => {
            await this._channel.close();
            this.emit(events_1.Events.AndroidDevice.Close);
        });
    }
    async shell(command) {
        return this._wrapApiCall('androidDevice.shell', async () => {
            const { result } = await this._channel.shell({ command });
            return Buffer.from(result, 'base64');
        });
    }
    async open(command) {
        return this._wrapApiCall('androidDevice.open', async () => {
            return AndroidSocket.from((await this._channel.open({ command })).socket);
        });
    }
    async installApk(file, options) {
        return this._wrapApiCall('androidDevice.installApk', async () => {
            await this._channel.installApk({ file: await loadFile(file), args: options && options.args });
        });
    }
    async push(file, path, options) {
        return this._wrapApiCall('androidDevice.push', async () => {
            await this._channel.push({ file: await loadFile(file), path, mode: options ? options.mode : undefined });
        });
    }
    async launchBrowser(options = {}) {
        return this._wrapApiCall('androidDevice.launchBrowser', async () => {
            const contextOptions = await browserContext_1.prepareBrowserContextOptions(options);
            const { context } = await this._channel.launchBrowser(contextOptions);
            return browserContext_1.BrowserContext.from(context);
        });
    }
    async waitForEvent(event, optionsOrPredicate = {}) {
        const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === 'function' ? {} : optionsOrPredicate);
        const predicate = typeof optionsOrPredicate === 'function' ? optionsOrPredicate : optionsOrPredicate.predicate;
        const waiter = new waiter_1.Waiter();
        waiter.rejectOnTimeout(timeout, `Timeout while waiting for event "${event}"`);
        if (event !== events_1.Events.AndroidDevice.Close)
            waiter.rejectOnEvent(this, events_1.Events.AndroidDevice.Close, new Error('Device closed'));
        const result = await waiter.waitForEvent(this, event, predicate);
        waiter.dispose();
        return result;
    }
}
exports.AndroidDevice = AndroidDevice;
class AndroidSocket extends channelOwner_1.ChannelOwner {
    static from(androidDevice) {
        return androidDevice._object;
    }
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._channel.on('data', ({ data }) => this.emit(events_1.Events.AndroidSocket.Data, Buffer.from(data, 'base64')));
        this._channel.on('close', () => this.emit(events_1.Events.AndroidSocket.Close));
    }
    async write(data) {
        return this._wrapApiCall('androidDevice.write', async () => {
            await this._channel.write({ data: data.toString('base64') });
        });
    }
    async close() {
        return this._wrapApiCall('androidDevice.close', async () => {
            await this._channel.close();
        });
    }
}
exports.AndroidSocket = AndroidSocket;
async function loadFile(file) {
    if (utils_1.isString(file))
        return (await util.promisify(fs.readFile)(file)).toString('base64');
    return file.toString('base64');
}
class Input {
    constructor(device) {
        this._device = device;
    }
    async type(text) {
        return this._device._wrapApiCall('androidDevice.inputType', async () => {
            await this._device._channel.inputType({ text });
        });
    }
    async press(key) {
        return this._device._wrapApiCall('androidDevice.inputPress', async () => {
            await this._device._channel.inputPress({ key });
        });
    }
    async tap(point) {
        return this._device._wrapApiCall('androidDevice.inputTap', async () => {
            await this._device._channel.inputTap({ point });
        });
    }
    async swipe(from, segments, steps) {
        return this._device._wrapApiCall('androidDevice.inputSwipe', async () => {
            await this._device._channel.inputSwipe({ segments, steps });
        });
    }
    async drag(from, to, steps) {
        return this._device._wrapApiCall('androidDevice.inputDragAndDrop', async () => {
            await this._device._channel.inputDrag({ from, to, steps });
        });
    }
}
function toSelectorChannel(selector) {
    const { checkable, checked, clazz, clickable, depth, desc, enabled, focusable, focused, hasChild, hasDescendant, longClickable, pkg, res, scrollable, selected, text, } = selector;
    const toRegex = (value) => {
        if (value === undefined)
            return undefined;
        if (value instanceof RegExp)
            return value.source;
        return '^' + value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d') + '$';
    };
    return {
        checkable,
        checked,
        clazz: toRegex(clazz),
        pkg: toRegex(pkg),
        desc: toRegex(desc),
        res: toRegex(res),
        text: toRegex(text),
        clickable,
        depth,
        enabled,
        focusable,
        focused,
        hasChild: hasChild ? { selector: toSelectorChannel(hasChild.selector) } : undefined,
        hasDescendant: hasDescendant ? { selector: toSelectorChannel(hasDescendant.selector), maxDepth: hasDescendant.maxDepth } : undefined,
        longClickable,
        scrollable,
        selected,
    };
}
class AndroidWebView extends events_2.EventEmitter {
    constructor(device, data) {
        super();
        this._device = device;
        this._data = data;
    }
    pid() {
        return this._data.pid;
    }
    pkg() {
        return this._data.pkg;
    }
    async page() {
        if (!this._pagePromise)
            this._pagePromise = this._fetchPage();
        return this._pagePromise;
    }
    async _fetchPage() {
        return this._device._wrapApiCall('androidWebView.page', async () => {
            const { context } = await this._device._channel.connectToWebView({ pid: this._data.pid });
            return browserContext_1.BrowserContext.from(context).pages()[0];
        });
    }
}
exports.AndroidWebView = AndroidWebView;
//# sourceMappingURL=android.js.map