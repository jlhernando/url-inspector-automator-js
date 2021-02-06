"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Snapshotter = void 0;
const browserContext_1 = require("../server/browserContext");
const page_1 = require("../server/page");
const helper_1 = require("../server/helper");
const progress_1 = require("../server/progress");
const debugLogger_1 = require("../utils/debugLogger");
const js = require("../server/javascript");
const snapshotterInjected_1 = require("./snapshotterInjected");
const utils_1 = require("../utils/utils");
class Snapshotter {
    constructor(context, delegate) {
        this._context = context;
        this._delegate = delegate;
        this._eventListeners = [
            helper_1.helper.addEventListener(this._context, browserContext_1.BrowserContext.Events.Page, this._onPage.bind(this)),
        ];
    }
    dispose() {
        helper_1.helper.removeEventListeners(this._eventListeners);
    }
    _onPage(page) {
        this._eventListeners.push(helper_1.helper.addEventListener(page, page_1.Page.Events.Response, (response) => {
            this._saveResource(page, response).catch(e => debugLogger_1.debugLogger.log('error', e));
        }));
    }
    async _saveResource(page, response) {
        const isRedirect = response.status() >= 300 && response.status() <= 399;
        if (isRedirect)
            return;
        // Shortcut all redirects - we cannot intercept them properly.
        let original = response.request();
        while (original.redirectedFrom())
            original = original.redirectedFrom();
        const url = original.url();
        let contentType = '';
        for (const { name, value } of response.headers()) {
            if (name.toLowerCase() === 'content-type')
                contentType = value;
        }
        const body = await response.body().catch(e => debugLogger_1.debugLogger.log('error', e));
        const sha1 = body ? utils_1.calculateSha1(body) : 'none';
        const resource = {
            pageId: this._delegate.pageId(page),
            frameId: response.frame()._id,
            url,
            contentType,
            responseHeaders: response.headers(),
            sha1,
        };
        this._delegate.onResource(resource);
        if (body)
            this._delegate.onBlob({ sha1, buffer: body });
    }
    async takeSnapshot(page, target, timeout) {
        utils_1.assert(page.context() === this._context);
        const frames = page.frames();
        const frameSnapshotPromises = frames.map(async (frame) => {
            // TODO: use different timeout depending on the frame depth/origin
            // to avoid waiting for too long for some useless frame.
            const frameResult = await progress_1.runAbortableTask(progress => this._snapshotFrame(progress, target, frame), timeout).catch(e => null);
            if (frameResult)
                return frameResult;
            const frameSnapshot = {
                frameId: frame._id,
                url: removeHash(frame.url()),
                html: '<body>Snapshot is not available</body>',
                resourceOverrides: [],
            };
            return { snapshot: frameSnapshot, mapping: new Map() };
        });
        const viewportSize = await this._getViewportSize(page, timeout);
        const results = await Promise.all(frameSnapshotPromises);
        if (!viewportSize)
            return null;
        const mainFrame = results[0];
        if (!mainFrame.snapshot.url.startsWith('http'))
            mainFrame.snapshot.url = 'http://playwright.snapshot/';
        const mapping = new Map();
        for (const result of results) {
            for (const [key, value] of result.mapping)
                mapping.set(key, value);
        }
        const childFrames = [];
        for (let i = 1; i < results.length; i++) {
            const result = results[i];
            const frame = frames[i];
            if (!mapping.has(frame))
                continue;
            const frameSnapshot = result.snapshot;
            frameSnapshot.url = mapping.get(frame);
            childFrames.push(frameSnapshot);
        }
        return {
            viewportSize,
            frames: [mainFrame.snapshot, ...childFrames],
        };
    }
    async _getViewportSize(page, timeout) {
        return progress_1.runAbortableTask(async (progress) => {
            const viewportSize = page.viewportSize();
            if (viewportSize)
                return viewportSize;
            const context = await page.mainFrame()._utilityContext();
            return context.evaluateInternal(() => {
                return {
                    width: Math.max(document.body.offsetWidth, document.documentElement.offsetWidth),
                    height: Math.max(document.body.offsetHeight, document.documentElement.offsetHeight),
                };
            });
        }, timeout).catch(e => null);
    }
    async _snapshotFrame(progress, target, frame) {
        if (!progress.isRunning())
            return null;
        if (target && (await target.ownerFrame()) !== frame)
            target = undefined;
        const context = await frame._utilityContext();
        const guid = utils_1.createGuid();
        const removeNoScript = !frame._page.context()._options.javaScriptEnabled;
        const result = await js.evaluate(context, false /* returnByValue */, snapshotterInjected_1.takeSnapshotInFrame, guid, removeNoScript, target);
        if (!progress.isRunning())
            return null;
        const properties = await result.getProperties();
        const data = await properties.get('data').jsonValue();
        const frameElements = await properties.get('frameElements').getProperties();
        result.dispose();
        const snapshot = {
            frameId: frame._id,
            url: removeHash(frame.url()),
            html: data.html,
            resourceOverrides: [],
        };
        const mapping = new Map();
        for (const { url, content } of data.resourceOverrides) {
            const buffer = Buffer.from(content);
            const sha1 = utils_1.calculateSha1(buffer);
            this._delegate.onBlob({ sha1, buffer });
            snapshot.resourceOverrides.push({ url, sha1 });
        }
        for (let i = 0; i < data.frameUrls.length; i++) {
            const element = frameElements.get(String(i)).asElement();
            if (!element)
                continue;
            const frame = await element.contentFrame().catch(e => null);
            if (frame)
                mapping.set(frame, data.frameUrls[i]);
        }
        return { snapshot, mapping };
    }
}
exports.Snapshotter = Snapshotter;
function removeHash(url) {
    try {
        const u = new URL(url);
        u.hash = '';
        return u.toString();
    }
    catch (e) {
        return url;
    }
}
//# sourceMappingURL=snapshotter.js.map