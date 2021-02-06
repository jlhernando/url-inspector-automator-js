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
exports.Firefox = void 0;
const os = require("os");
const fs = require("fs");
const path = require("path");
const ffBrowser_1 = require("./ffBrowser");
const ffConnection_1 = require("./ffConnection");
const browserType_1 = require("../browserType");
class Firefox extends browserType_1.BrowserType {
    _connectToTransport(transport, options) {
        return ffBrowser_1.FFBrowser.connect(transport, options);
    }
    _rewriteStartupError(error) {
        return error;
    }
    _amendEnvironment(env, userDataDir, executable, browserArguments) {
        return os.platform() === 'linux' ? {
            ...env,
            // On linux Juggler ships the libstdc++ it was linked against.
            LD_LIBRARY_PATH: `${path.dirname(executable)}:${process.env.LD_LIBRARY_PATH}`,
        } : env;
    }
    _attemptToGracefullyCloseBrowser(transport) {
        const message = { method: 'Browser.close', params: {}, id: ffConnection_1.kBrowserCloseMessageId };
        transport.send(message);
    }
    _defaultArgs(options, isPersistent, userDataDir) {
        const { args = [], devtools, headless } = options;
        if (devtools)
            console.warn('devtools parameter is not supported as a launch argument in Firefox. You can launch the devtools window manually.');
        const userDataDirArg = args.find(arg => arg.startsWith('-profile') || arg.startsWith('--profile'));
        if (userDataDirArg)
            throw new Error('Pass userDataDir parameter instead of specifying -profile argument');
        if (args.find(arg => arg.startsWith('-juggler')))
            throw new Error('Use the port parameter instead of -juggler argument');
        const firefoxUserPrefs = isPersistent ? undefined : options.firefoxUserPrefs;
        if (firefoxUserPrefs) {
            const lines = [];
            for (const [name, value] of Object.entries(firefoxUserPrefs))
                lines.push(`user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`);
            fs.writeFileSync(path.join(userDataDir, 'user.js'), lines.join('\n'));
        }
        const firefoxArguments = ['-no-remote'];
        if (headless) {
            firefoxArguments.push('-headless');
        }
        else {
            firefoxArguments.push('-wait-for-browser');
            firefoxArguments.push('-foreground');
        }
        firefoxArguments.push(`-profile`, userDataDir);
        firefoxArguments.push('-juggler-pipe');
        firefoxArguments.push(...args);
        if (isPersistent)
            firefoxArguments.push('about:blank');
        else
            firefoxArguments.push('-silent');
        return firefoxArguments;
    }
}
exports.Firefox = Firefox;
//# sourceMappingURL=firefox.js.map