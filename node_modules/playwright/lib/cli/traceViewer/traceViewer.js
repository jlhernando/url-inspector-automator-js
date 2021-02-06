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
exports.showTraceViewer = void 0;
const fs = require("fs");
const path = require("path");
const playwright = require("../../..");
const util = require("util");
const screenshotGenerator_1 = require("./screenshotGenerator");
const snapshotRouter_1 = require("./snapshotRouter");
const traceModel_1 = require("./traceModel");
const videoTileGenerator_1 = require("./videoTileGenerator");
const fsReadFileAsync = util.promisify(fs.readFile.bind(fs));
class TraceViewer {
    constructor(traceStorageDir) {
        this._traceStorageDir = traceStorageDir;
        this._snapshotRouter = new snapshotRouter_1.SnapshotRouter(traceStorageDir);
        this._traceModel = {
            contexts: [],
        };
        this._screenshotGenerator = new screenshotGenerator_1.ScreenshotGenerator(traceStorageDir, this._traceModel);
        this._videoTileGenerator = new videoTileGenerator_1.VideoTileGenerator(this._traceModel);
    }
    async load(filePath) {
        const traceContent = await fsReadFileAsync(filePath, 'utf8');
        const events = traceContent.split('\n').map(line => line.trim()).filter(line => !!line).map(line => JSON.parse(line));
        traceModel_1.readTraceFile(events, this._traceModel, filePath);
    }
    async show() {
        const browser = await playwright.chromium.launch({ headless: false });
        const uiPage = await browser.newPage({ viewport: null });
        uiPage.on('close', () => process.exit(0));
        await uiPage.exposeBinding('readFile', async (_, path) => {
            return fs.readFileSync(path).toString();
        });
        await uiPage.exposeBinding('renderSnapshot', async (_, action) => {
            try {
                if (!action.snapshot) {
                    const snapshotFrame = uiPage.frames()[1];
                    await snapshotFrame.goto('data:text/html,No snapshot available');
                    return;
                }
                const snapshot = await fsReadFileAsync(path.join(this._traceStorageDir, action.snapshot.sha1), 'utf8');
                const snapshotObject = JSON.parse(snapshot);
                const contextEntry = this._traceModel.contexts.find(entry => entry.created.contextId === action.contextId);
                this._snapshotRouter.selectSnapshot(snapshotObject, contextEntry);
                // TODO: fix Playwright bug where frame.name is lost (empty).
                const snapshotFrame = uiPage.frames()[1];
                try {
                    await snapshotFrame.goto(snapshotObject.frames[0].url);
                }
                catch (e) {
                    if (!e.message.includes('frame was detached'))
                        console.error(e);
                    return;
                }
                const element = await snapshotFrame.$(action.selector || '*[__playwright_target__]');
                if (element) {
                    await element.evaluate(e => {
                        e.style.backgroundColor = '#ff69b460';
                    });
                }
            }
            catch (e) {
                console.log(e); // eslint-disable-line no-console
            }
        });
        await uiPage.exposeBinding('getTraceModel', () => this._traceModel);
        await uiPage.exposeBinding('getVideoMetaInfo', async (_, videoId) => {
            return this._videoTileGenerator.render(videoId);
        });
        await uiPage.route('**/*', (route, request) => {
            if (request.frame().parentFrame()) {
                this._snapshotRouter.route(route);
                return;
            }
            const url = new URL(request.url());
            try {
                if (request.url().includes('action-preview')) {
                    const fullPath = url.pathname.substring('/action-preview/'.length);
                    const actionId = fullPath.substring(0, fullPath.indexOf('.png'));
                    this._screenshotGenerator.generateScreenshot(actionId).then(body => {
                        if (body)
                            route.fulfill({ contentType: 'image/png', body });
                        else
                            route.fulfill({ status: 404 });
                    });
                    return;
                }
                let filePath;
                if (request.url().includes('video-tile')) {
                    const fullPath = url.pathname.substring('/video-tile/'.length);
                    filePath = this._videoTileGenerator.tilePath(fullPath);
                }
                else {
                    filePath = path.join(__dirname, 'web', url.pathname.substring(1));
                }
                const body = fs.readFileSync(filePath);
                route.fulfill({
                    contentType: extensionToMime[path.extname(url.pathname).substring(1)] || 'text/plain',
                    body,
                });
            }
            catch (e) {
                console.log(e); // eslint-disable-line no-console
                route.fulfill({
                    status: 404
                });
            }
        });
        await uiPage.goto('http://trace-viewer/index.html');
    }
}
async function showTraceViewer(traceStorageDir, tracePath) {
    if (!fs.existsSync(tracePath))
        throw new Error(`${tracePath} does not exist`);
    const files = fs.statSync(tracePath).isFile() ? [tracePath] : collectFiles(tracePath);
    if (!traceStorageDir) {
        traceStorageDir = fs.statSync(tracePath).isFile() ? path.dirname(tracePath) : tracePath;
        if (fs.existsSync(traceStorageDir + '/trace-resources'))
            traceStorageDir = traceStorageDir + '/trace-resources';
    }
    const traceViewer = new TraceViewer(traceStorageDir);
    for (const filePath of files)
        await traceViewer.load(filePath);
    await traceViewer.show();
}
exports.showTraceViewer = showTraceViewer;
function collectFiles(dir) {
    const files = [];
    for (const name of fs.readdirSync(dir)) {
        const fullName = path.join(dir, name);
        if (fs.lstatSync(fullName).isDirectory())
            files.push(...collectFiles(fullName));
        else if (fullName.endsWith('.trace'))
            files.push(fullName);
    }
    return files;
}
const extensionToMime = {
    'css': 'text/css',
    'html': 'text/html',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'js': 'application/javascript',
    'png': 'image/png',
    'ttf': 'font/ttf',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
};
//# sourceMappingURL=traceViewer.js.map