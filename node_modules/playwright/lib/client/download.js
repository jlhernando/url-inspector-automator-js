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
exports.Download = void 0;
const channelOwner_1 = require("./channelOwner");
const stream_1 = require("./stream");
const fs = require("fs");
const utils_1 = require("../utils/utils");
class Download extends channelOwner_1.ChannelOwner {
    constructor(parent, type, guid, initializer) {
        super(parent, type, guid, initializer);
        this._browser = parent._browser;
    }
    static from(download) {
        return download._object;
    }
    url() {
        return this._initializer.url;
    }
    suggestedFilename() {
        return this._initializer.suggestedFilename;
    }
    async path() {
        if (this._browser && this._browser._isRemote)
            throw new Error(`Path is not available when using browserType.connect(). Use download.saveAs() to save a local copy.`);
        return (await this._channel.path()).value || null;
    }
    async saveAs(path) {
        return this._wrapApiCall('download.saveAs', async () => {
            if (!this._browser || !this._browser._isRemote) {
                await this._channel.saveAs({ path });
                return;
            }
            const result = await this._channel.saveAsStream();
            const stream = stream_1.Stream.from(result.stream);
            await utils_1.mkdirIfNeeded(path);
            await new Promise((resolve, reject) => {
                stream.stream().pipe(fs.createWriteStream(path))
                    .on('finish', resolve)
                    .on('error', reject);
            });
        });
    }
    async failure() {
        return (await this._channel.failure()).error || null;
    }
    async createReadStream() {
        const result = await this._channel.stream();
        if (!result.stream)
            return null;
        const stream = stream_1.Stream.from(result.stream);
        return stream.stream();
    }
    async delete() {
        return this._channel.delete();
    }
}
exports.Download = Download;
//# sourceMappingURL=download.js.map