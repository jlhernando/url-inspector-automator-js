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
exports.BrowserType = void 0;
const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const browserContext_1 = require("./browserContext");
const browserPaths = require("../utils/browserPaths");
const processLauncher_1 = require("./processLauncher");
const pipeTransport_1 = require("./pipeTransport");
const progress_1 = require("./progress");
const timeoutSettings_1 = require("../utils/timeoutSettings");
const validateDependencies_1 = require("./validateDependencies");
const utils_1 = require("../utils/utils");
const helper_1 = require("./helper");
const debugLogger_1 = require("../utils/debugLogger");
const mkdirAsync = util.promisify(fs.mkdir);
const mkdtempAsync = util.promisify(fs.mkdtemp);
const existsAsync = (path) => new Promise(resolve => fs.stat(path, err => resolve(!err)));
const DOWNLOADS_FOLDER = path.join(os.tmpdir(), 'playwright_downloads-');
class BrowserType {
    constructor(packagePath, browser) {
        this._name = browser.name;
        const browsersPath = browserPaths.browsersPath(packagePath);
        this._browserDescriptor = browser;
        this._browserPath = browserPaths.browserDirectory(browsersPath, browser);
        this._executablePath = browserPaths.executablePath(this._browserPath, browser) || '';
    }
    executablePath() {
        return this._executablePath;
    }
    name() {
        return this._name;
    }
    async launch(options, protocolLogger) {
        options = validateLaunchOptions(options);
        const controller = new progress_1.ProgressController();
        controller.setLogName('browser');
        const browser = await controller.run(progress => {
            return this._innerLaunch(progress, options, undefined, helper_1.helper.debugProtocolLogger(protocolLogger)).catch(e => { throw this._rewriteStartupError(e); });
        }, timeoutSettings_1.TimeoutSettings.timeout(options));
        return browser;
    }
    async launchPersistentContext(userDataDir, options = {}) {
        options = validateLaunchOptions(options);
        const persistent = options;
        const controller = new progress_1.ProgressController();
        controller.setLogName('browser');
        const browser = await controller.run(progress => {
            return this._innerLaunch(progress, options, persistent, helper_1.helper.debugProtocolLogger(), userDataDir).catch(e => { throw this._rewriteStartupError(e); });
        }, timeoutSettings_1.TimeoutSettings.timeout(options));
        return browser._defaultContext;
    }
    async _innerLaunch(progress, options, persistent, protocolLogger, userDataDir) {
        options.proxy = options.proxy ? browserContext_1.normalizeProxySettings(options.proxy) : undefined;
        const browserLogsCollector = new debugLogger_1.RecentLogsCollector();
        const { browserProcess, downloadsPath, transport } = await this._launchProcess(progress, options, !!persistent, browserLogsCollector, userDataDir);
        if (options.__testHookBeforeCreateBrowser)
            await options.__testHookBeforeCreateBrowser();
        const browserOptions = {
            name: this._name,
            isChromium: this._name === 'chromium',
            slowMo: options.slowMo,
            persistent,
            headful: !options.headless,
            downloadsPath,
            browserProcess,
            proxy: options.proxy,
            protocolLogger,
            browserLogsCollector,
        };
        if (persistent)
            browserContext_1.validateBrowserContextOptions(persistent, browserOptions);
        copyTestHooks(options, browserOptions);
        const browser = await this._connectToTransport(transport, browserOptions);
        // We assume no control when using custom arguments, and do not prepare the default context in that case.
        if (persistent && !options.ignoreAllDefaultArgs)
            await browser._defaultContext._loadDefaultContext(progress);
        return browser;
    }
    async _launchProcess(progress, options, isPersistent, browserLogsCollector, userDataDir) {
        const { ignoreDefaultArgs, ignoreAllDefaultArgs, args = [], executablePath = null, handleSIGINT = true, handleSIGTERM = true, handleSIGHUP = true, } = options;
        const env = options.env ? processLauncher_1.envArrayToObject(options.env) : process.env;
        const tempDirectories = [];
        const ensurePath = async (tmpPrefix, pathFromOptions) => {
            let dir;
            if (pathFromOptions) {
                dir = pathFromOptions;
                await mkdirAsync(pathFromOptions, { recursive: true });
            }
            else {
                dir = await mkdtempAsync(tmpPrefix);
                tempDirectories.push(dir);
            }
            return dir;
        };
        // TODO: add downloadsPath to newContext().
        const downloadsPath = await ensurePath(DOWNLOADS_FOLDER, options.downloadsPath);
        if (!userDataDir) {
            userDataDir = await mkdtempAsync(path.join(os.tmpdir(), `playwright_${this._name}dev_profile-`));
            tempDirectories.push(userDataDir);
        }
        const browserArguments = [];
        if (ignoreAllDefaultArgs)
            browserArguments.push(...args);
        else if (ignoreDefaultArgs)
            browserArguments.push(...this._defaultArgs(options, isPersistent, userDataDir).filter(arg => ignoreDefaultArgs.indexOf(arg) === -1));
        else
            browserArguments.push(...this._defaultArgs(options, isPersistent, userDataDir));
        const executable = executablePath || this.executablePath();
        if (!executable)
            throw new Error(`No executable path is specified. Pass "executablePath" option directly.`);
        if (!(await existsAsync(executable))) {
            const errorMessageLines = [`Failed to launch ${this._name} because executable doesn't exist at ${executable}`];
            // If we tried using stock downloaded browser, suggest re-installing playwright.
            if (!executablePath)
                errorMessageLines.push(`Try re-installing playwright with "npm install playwright"`);
            throw new Error(errorMessageLines.join('\n'));
        }
        if (!executablePath) {
            // We can only validate dependencies for bundled browsers.
            await validateDependencies_1.validateHostRequirements(this._browserPath, this._browserDescriptor);
        }
        // Note: it is important to define these variables before launchProcess, so that we don't get
        // "Cannot access 'browserServer' before initialization" if something went wrong.
        let transport = undefined;
        let browserProcess = undefined;
        const { launchedProcess, gracefullyClose, kill } = await processLauncher_1.launchProcess({
            executablePath: executable,
            args: browserArguments,
            env: this._amendEnvironment(env, userDataDir, executable, browserArguments),
            handleSIGINT,
            handleSIGTERM,
            handleSIGHUP,
            log: (message) => {
                progress.log(message);
                browserLogsCollector.log(message);
            },
            stdio: 'pipe',
            tempDirectories,
            attemptToGracefullyClose: async () => {
                if (options.__testHookGracefullyClose)
                    await options.__testHookGracefullyClose();
                // We try to gracefully close to prevent crash reporting and core dumps.
                // Note that it's fine to reuse the pipe transport, since
                // our connection ignores kBrowserCloseMessageId.
                this._attemptToGracefullyCloseBrowser(transport);
            },
            onExit: (exitCode, signal) => {
                if (browserProcess && browserProcess.onclose)
                    browserProcess.onclose(exitCode, signal);
            },
        });
        browserProcess = {
            onclose: undefined,
            process: launchedProcess,
            close: gracefullyClose,
            kill
        };
        progress.cleanupWhenAborted(() => browserProcess && closeOrKill(browserProcess, progress.timeUntilDeadline()));
        const stdio = launchedProcess.stdio;
        transport = new pipeTransport_1.PipeTransport(stdio[3], stdio[4]);
        return { browserProcess, downloadsPath, transport };
    }
}
exports.BrowserType = BrowserType;
function copyTestHooks(from, to) {
    for (const [key, value] of Object.entries(from)) {
        if (key.startsWith('__testHook'))
            to[key] = value;
    }
}
function validateLaunchOptions(options) {
    const { devtools = false, headless = !utils_1.isDebugMode() && !devtools } = options;
    return { ...options, devtools, headless };
}
async function closeOrKill(browserProcess, timeout) {
    let timer;
    try {
        await Promise.race([
            browserProcess.close(),
            new Promise((resolve, reject) => timer = setTimeout(reject, timeout)),
        ]);
    }
    catch (ignored) {
        await browserProcess.kill().catch(ignored => { }); // Make sure to await actual process exit.
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=browserType.js.map