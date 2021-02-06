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
exports.ScreenshotGenerator = void 0;
const fs = require("fs");
const path = require("path");
const playwright = require("../../..");
const util = require("util");
const snapshotRouter_1 = require("./snapshotRouter");
const traceModel_1 = require("./traceModel");
const fsReadFileAsync = util.promisify(fs.readFile.bind(fs));
const fsWriteFileAsync = util.promisify(fs.writeFile.bind(fs));
class ScreenshotGenerator {
    constructor(traceStorageDir, traceModel) {
        this._rendering = new Map();
        this._traceStorageDir = traceStorageDir;
        this._traceModel = traceModel;
    }
    async generateScreenshot(actionId) {
        const { context, action } = traceModel_1.actionById(this._traceModel, actionId);
        if (!action.action.snapshot)
            return;
        const imageFileName = path.join(this._traceStorageDir, action.action.snapshot.sha1 + '-thumbnail.png');
        let body;
        try {
            body = await fsReadFileAsync(imageFileName);
        }
        catch (e) {
            if (!this._rendering.has(action)) {
                this._rendering.set(action, this._render(context, action, imageFileName).then(body => {
                    this._rendering.delete(action);
                    return body;
                }));
            }
            body = await this._rendering.get(action);
        }
        return body;
    }
    _browser() {
        if (!this._browserPromise)
            this._browserPromise = playwright.chromium.launch();
        return this._browserPromise;
    }
    async _render(contextEntry, actionEntry, imageFileName) {
        const { action } = actionEntry;
        const browser = await this._browser();
        const page = await browser.newPage({
            viewport: contextEntry.created.viewportSize,
            deviceScaleFactor: contextEntry.created.deviceScaleFactor
        });
        try {
            const snapshotPath = path.join(this._traceStorageDir, action.snapshot.sha1);
            let snapshot;
            try {
                snapshot = await fsReadFileAsync(snapshotPath, 'utf8');
            }
            catch (e) {
                console.log(`Unable to read snapshot at ${snapshotPath}`); // eslint-disable-line no-console
                return;
            }
            const snapshotObject = JSON.parse(snapshot);
            const snapshotRouter = new snapshotRouter_1.SnapshotRouter(this._traceStorageDir);
            snapshotRouter.selectSnapshot(snapshotObject, contextEntry);
            page.route('**/*', route => snapshotRouter.route(route));
            const url = snapshotObject.frames[0].url;
            console.log('Generating screenshot for ' + action.action, snapshotObject.frames[0].url); // eslint-disable-line no-console
            await page.goto(url);
            let clip = undefined;
            const element = await page.$(action.selector || '*[__playwright_target__]');
            if (element) {
                await element.evaluate(e => {
                    e.style.backgroundColor = '#ff69b460';
                });
                clip = await element.boundingBox() || undefined;
                if (clip) {
                    const thumbnailSize = {
                        width: 400,
                        height: 200
                    };
                    const insets = {
                        width: 60,
                        height: 30
                    };
                    clip.width = Math.min(thumbnailSize.width, clip.width);
                    clip.height = Math.min(thumbnailSize.height, clip.height);
                    if (clip.width < thumbnailSize.width) {
                        clip.x -= (thumbnailSize.width - clip.width) / 2;
                        clip.x = Math.max(0, clip.x);
                        clip.width = thumbnailSize.width;
                    }
                    else {
                        clip.x = Math.max(0, clip.x - insets.width);
                    }
                    if (clip.height < thumbnailSize.height) {
                        clip.y -= (thumbnailSize.height - clip.height) / 2;
                        clip.y = Math.max(0, clip.y);
                        clip.height = thumbnailSize.height;
                    }
                    else {
                        clip.y = Math.max(0, clip.y - insets.height);
                    }
                }
            }
            const imageData = await page.screenshot({ clip });
            await fsWriteFileAsync(imageFileName, imageData);
            return imageData;
        }
        catch (e) {
            console.log(e); // eslint-disable-line no-console
        }
        finally {
            await page.close();
        }
    }
}
exports.ScreenshotGenerator = ScreenshotGenerator;
//# sourceMappingURL=screenshotGenerator.js.map