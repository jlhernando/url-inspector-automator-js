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
exports.VideoTileGenerator = void 0;
const child_process_1 = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");
const traceModel_1 = require("./traceModel");
const binaryPaths_1 = require("../../utils/binaryPaths");
const fsReadFileAsync = util.promisify(fs.readFile.bind(fs));
const fsWriteFileAsync = util.promisify(fs.writeFile.bind(fs));
class VideoTileGenerator {
    constructor(traceModel) {
        this._traceModel = traceModel;
    }
    tilePath(urlPath) {
        const index = urlPath.lastIndexOf('/');
        const tile = urlPath.substring(index + 1);
        const videoId = urlPath.substring(0, index);
        const { context, page } = traceModel_1.videoById(this._traceModel, videoId);
        const videoFilePath = path.join(path.dirname(context.filePath), page.video.video.fileName);
        return videoFilePath + '-' + tile;
    }
    async render(videoId) {
        const { context, page } = traceModel_1.videoById(this._traceModel, videoId);
        const video = page.video.video;
        const videoFilePath = path.join(path.dirname(context.filePath), video.fileName);
        const metaInfoFilePath = videoFilePath + '-metainfo.txt';
        try {
            const metaInfo = await fsReadFileAsync(metaInfoFilePath, 'utf8');
            return metaInfo ? JSON.parse(metaInfo) : undefined;
        }
        catch (e) {
        }
        const ffmpeg = binaryPaths_1.ffmpegExecutable();
        console.log('Generating frames for ' + videoFilePath); // eslint-disable-line no-console
        // Force output frame rate to 25 fps as otherwise it would produce one image per timebase unit
        // which is currently 1 / (25 * 1000).
        const result = child_process_1.spawnSync(ffmpeg, ['-i', videoFilePath, '-r', '25', `${videoFilePath}-%03d.png`]);
        const metaInfo = parseMetaInfo(result.stderr.toString(), video);
        await fsWriteFileAsync(metaInfoFilePath, metaInfo ? JSON.stringify(metaInfo) : '');
        return metaInfo;
    }
}
exports.VideoTileGenerator = VideoTileGenerator;
function parseMetaInfo(text, video) {
    const lines = text.split('\n');
    let framesLine = lines.find(l => l.startsWith('frame='));
    if (!framesLine)
        return;
    framesLine = framesLine.substring(framesLine.lastIndexOf('frame='));
    const framesMatch = framesLine.match(/frame=\s+(\d+)/);
    const outputLineIndex = lines.findIndex(l => l.trim().startsWith('Output #0'));
    const streamLine = lines.slice(outputLineIndex).find(l => l.trim().startsWith('Stream #0:0'));
    const fpsMatch = streamLine.match(/, (\d+) fps,/);
    const resolutionMatch = streamLine.match(/, (\d+)x(\d+)\D/);
    const durationMatch = lines.find(l => l.trim().startsWith('Duration')).match(/Duration: (\d+):(\d\d):(\d\d.\d\d)/);
    const duration = (((parseInt(durationMatch[1], 10) * 60) + parseInt(durationMatch[2], 10)) * 60 + parseFloat(durationMatch[3])) * 1000;
    return {
        frames: parseInt(framesMatch[1], 10),
        width: parseInt(resolutionMatch[1], 10),
        height: parseInt(resolutionMatch[2], 10),
        fps: parseInt(fpsMatch[1], 10),
        startTime: video.timestamp,
        endTime: video.timestamp + duration
    };
}
//# sourceMappingURL=videoTileGenerator.js.map