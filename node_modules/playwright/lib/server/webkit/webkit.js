"use strict";
/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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
exports.WebKit = void 0;
const wkBrowser_1 = require("../webkit/wkBrowser");
const path = require("path");
const wkConnection_1 = require("./wkConnection");
const browserType_1 = require("../browserType");
class WebKit extends browserType_1.BrowserType {
    _connectToTransport(transport, options) {
        return wkBrowser_1.WKBrowser.connect(transport, options);
    }
    _amendEnvironment(env, userDataDir, executable, browserArguments) {
        return { ...env, CURL_COOKIE_JAR_PATH: path.join(userDataDir, 'cookiejar.db') };
    }
    _rewriteStartupError(error) {
        return error;
    }
    _attemptToGracefullyCloseBrowser(transport) {
        transport.send({ method: 'Playwright.close', params: {}, id: wkConnection_1.kBrowserCloseMessageId });
    }
    _defaultArgs(options, isPersistent, userDataDir) {
        const { args = [], proxy, devtools, headless } = options;
        if (devtools)
            console.warn('devtools parameter as a launch argument in WebKit is not supported. Also starting Web Inspector manually will terminate the execution in WebKit.');
        const userDataDirArg = args.find(arg => arg.startsWith('--user-data-dir='));
        if (userDataDirArg)
            throw new Error('Pass userDataDir parameter instead of specifying --user-data-dir argument');
        if (args.find(arg => !arg.startsWith('-')))
            throw new Error('Arguments can not specify page to be opened');
        const webkitArguments = ['--inspector-pipe'];
        if (headless)
            webkitArguments.push('--headless');
        if (isPersistent)
            webkitArguments.push(`--user-data-dir=${userDataDir}`);
        else
            webkitArguments.push(`--no-startup-window`);
        if (proxy) {
            if (process.platform === 'darwin') {
                webkitArguments.push(`--proxy=${proxy.server}`);
                if (proxy.bypass)
                    webkitArguments.push(`--proxy-bypass-list=${proxy.bypass}`);
            }
            else if (process.platform === 'linux') {
                webkitArguments.push(`--proxy=${proxy.server}`);
                if (proxy.bypass)
                    webkitArguments.push(...proxy.bypass.split(',').map(t => `--ignore-host=${t}`));
            }
            else if (process.platform === 'win32') {
                webkitArguments.push(`--curl-proxy=${proxy.server}`);
                if (proxy.bypass)
                    webkitArguments.push(`--curl-noproxy=${proxy.bypass}`);
            }
        }
        webkitArguments.push(...args);
        if (isPersistent)
            webkitArguments.push('about:blank');
        return webkitArguments;
    }
}
exports.WebKit = WebKit;
//# sourceMappingURL=webkit.js.map