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
exports.Browser = void 0;
const browserContext_1 = require("./browserContext");
const page_1 = require("./page");
const events_1 = require("events");
const download_1 = require("./download");
class Browser extends events_1.EventEmitter {
    constructor(options) {
        super();
        this._downloads = new Map();
        this._defaultContext = null;
        this._startedClosing = false;
        this._idToVideo = new Map();
        this._options = options;
    }
    async newPage(options) {
        const context = await this.newContext(options);
        const page = await context.newPage();
        page._ownedContext = context;
        return page;
    }
    _downloadCreated(page, uuid, url, suggestedFilename) {
        const download = new download_1.Download(page, this._options.downloadsPath || '', uuid, url, suggestedFilename);
        this._downloads.set(uuid, download);
    }
    _downloadFilenameSuggested(uuid, suggestedFilename) {
        const download = this._downloads.get(uuid);
        if (!download)
            return;
        download._filenameSuggested(suggestedFilename);
    }
    _downloadFinished(uuid, error) {
        const download = this._downloads.get(uuid);
        if (!download)
            return;
        download._reportFinished(error);
        this._downloads.delete(uuid);
    }
    _videoStarted(context, videoId, path, pageOrError) {
        const video = new browserContext_1.Video(context, videoId, path);
        this._idToVideo.set(videoId, video);
        context.emit(browserContext_1.BrowserContext.Events.VideoStarted, video);
        pageOrError.then(pageOrError => {
            if (pageOrError instanceof page_1.Page)
                pageOrError.videoStarted(video);
        });
    }
    _videoFinished(videoId) {
        const video = this._idToVideo.get(videoId);
        this._idToVideo.delete(videoId);
        video._finish();
    }
    _didClose() {
        for (const context of this.contexts())
            context._browserClosed();
        if (this._defaultContext)
            this._defaultContext._browserClosed();
        this.emit(Browser.Events.Disconnected);
    }
    async close() {
        if (!this._startedClosing) {
            this._startedClosing = true;
            await this._options.browserProcess.close();
        }
        if (this.isConnected())
            await new Promise(x => this.once(Browser.Events.Disconnected, x));
    }
}
exports.Browser = Browser;
Browser.Events = {
    Disconnected: 'disconnected',
};
//# sourceMappingURL=browser.js.map