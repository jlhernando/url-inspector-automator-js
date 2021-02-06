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
exports.ConsoleAPI = void 0;
const selectorGenerator_1 = require("./selectorGenerator");
class ConsoleAPI {
    constructor(injectedScript) {
        this._injectedScript = injectedScript;
        if (window.playwright)
            return;
        window.playwright = {
            $: (selector) => this._querySelector(selector),
            $$: (selector) => this._querySelectorAll(selector),
            inspect: (selector) => this._inspect(selector),
            selector: (element) => this._selector(element),
        };
    }
    _querySelector(selector) {
        if (typeof selector !== 'string')
            throw new Error(`Usage: playwright.query('Playwright >> selector').`);
        const parsed = this._injectedScript.parseSelector(selector);
        return this._injectedScript.querySelector(parsed, document);
    }
    _querySelectorAll(selector) {
        if (typeof selector !== 'string')
            throw new Error(`Usage: playwright.$$('Playwright >> selector').`);
        const parsed = this._injectedScript.parseSelector(selector);
        return this._injectedScript.querySelectorAll(parsed, document);
    }
    _inspect(selector) {
        if (typeof window.inspect !== 'function')
            return;
        if (typeof selector !== 'string')
            throw new Error(`Usage: playwright.inspect('Playwright >> selector').`);
        window.inspect(this._querySelector(selector));
    }
    _selector(element) {
        if (!(element instanceof Element))
            throw new Error(`Usage: playwright.selector(element).`);
        return selectorGenerator_1.generateSelector(this._injectedScript, element).selector;
    }
}
exports.ConsoleAPI = ConsoleAPI;
exports.default = ConsoleAPI;
//# sourceMappingURL=consoleApi.js.map