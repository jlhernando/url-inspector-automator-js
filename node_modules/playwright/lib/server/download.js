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
exports.Download = void 0;
const path = require("path");
const fs = require("fs");
const util = require("util");
const page_1 = require("./page");
const utils_1 = require("../utils/utils");
class Download {
    constructor(page, downloadsPath, uuid, url, suggestedFilename) {
        this._saveCallbacks = [];
        this._finished = false;
        this._failure = null;
        this._deleted = false;
        this._page = page;
        this._downloadsPath = downloadsPath;
        this._uuid = uuid;
        this._url = url;
        this._suggestedFilename = suggestedFilename;
        this._finishedCallback = () => { };
        this._finishedPromise = new Promise(f => this._finishedCallback = f);
        page._browserContext._downloads.add(this);
        this._acceptDownloads = !!this._page._browserContext._options.acceptDownloads;
        if (suggestedFilename !== undefined)
            this._page.emit(page_1.Page.Events.Download, this);
    }
    _filenameSuggested(suggestedFilename) {
        utils_1.assert(this._suggestedFilename === undefined);
        this._suggestedFilename = suggestedFilename;
        this._page.emit(page_1.Page.Events.Download, this);
    }
    url() {
        return this._url;
    }
    suggestedFilename() {
        return this._suggestedFilename;
    }
    async localPath() {
        if (!this._acceptDownloads)
            throw new Error('Pass { acceptDownloads: true } when you are creating your browser context.');
        const fileName = path.join(this._downloadsPath, this._uuid);
        await this._finishedPromise;
        if (this._failure)
            return null;
        return fileName;
    }
    saveAs(saveCallback) {
        if (!this._acceptDownloads)
            throw new Error('Pass { acceptDownloads: true } when you are creating your browser context.');
        if (this._deleted)
            throw new Error('Download already deleted. Save before deleting.');
        if (this._failure)
            throw new Error('Download not found on disk. Check download.failure() for details.');
        if (this._finished) {
            saveCallback(path.join(this._downloadsPath, this._uuid));
            return;
        }
        this._saveCallbacks.push(saveCallback);
    }
    async failure() {
        if (!this._acceptDownloads)
            return 'Pass { acceptDownloads: true } when you are creating your browser context.';
        await this._finishedPromise;
        return this._failure;
    }
    async delete() {
        if (!this._acceptDownloads)
            return;
        const fileName = await this.localPath();
        if (this._deleted)
            return;
        this._deleted = true;
        if (fileName)
            await util.promisify(fs.unlink)(fileName).catch(e => { });
    }
    async _reportFinished(error) {
        this._finished = true;
        this._failure = error || null;
        if (error) {
            for (const callback of this._saveCallbacks)
                callback('', error);
        }
        else {
            const fullPath = path.join(this._downloadsPath, this._uuid);
            for (const callback of this._saveCallbacks)
                await callback(fullPath);
        }
        this._saveCallbacks = [];
        this._finishedCallback();
    }
}
exports.Download = Download;
//# sourceMappingURL=download.js.map