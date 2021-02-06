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
exports.CodeGenerator = void 0;
class CodeGenerator {
    constructor(browserName, launchOptions, contextOptions, output, languageGenerator, deviceName, saveStorage) {
        this._output = output;
        this._languageGenerator = languageGenerator;
        launchOptions = { headless: false, ...launchOptions };
        const header = this._languageGenerator.generateHeader(browserName, launchOptions, contextOptions, deviceName);
        this._output.printLn(header);
        this._footerText = '\n' + this._languageGenerator.generateFooter(saveStorage);
        this._output.printLn(this._footerText);
    }
    exit() {
        this._output.flush();
    }
    addAction(action) {
        this.willPerformAction(action);
        this.didPerformAction(action);
    }
    willPerformAction(action) {
        this._currentAction = action;
    }
    didPerformAction(actionInContext) {
        const { action, pageAlias } = actionInContext;
        let eraseLastAction = false;
        if (this._lastAction && this._lastAction.pageAlias === pageAlias) {
            const { action: lastAction } = this._lastAction;
            // We augment last action based on the type.
            if (this._lastAction && action.name === 'fill' && lastAction.name === 'fill') {
                if (action.selector === lastAction.selector)
                    eraseLastAction = true;
            }
            if (lastAction && action.name === 'click' && lastAction.name === 'click') {
                if (action.selector === lastAction.selector && action.clickCount > lastAction.clickCount)
                    eraseLastAction = true;
            }
            if (lastAction && action.name === 'navigate' && lastAction.name === 'navigate') {
                if (action.url === lastAction.url)
                    return;
            }
            for (const name of ['check', 'uncheck']) {
                if (lastAction && action.name === name && lastAction.name === 'click') {
                    if (action.selector === lastAction.selector)
                        eraseLastAction = true;
                }
            }
        }
        this._printAction(actionInContext, eraseLastAction);
    }
    commitLastAction() {
        const action = this._lastAction;
        if (action)
            action.committed = true;
    }
    _printAction(actionInContext, eraseLastAction) {
        this._output.popLn(this._footerText);
        if (eraseLastAction && this._lastActionText)
            this._output.popLn(this._lastActionText);
        const performingAction = !!this._currentAction;
        this._currentAction = undefined;
        this._lastAction = actionInContext;
        this._lastActionText = this._languageGenerator.generateAction(actionInContext, performingAction);
        this._output.printLn(this._lastActionText);
        this._output.printLn(this._footerText);
    }
    signal(pageAlias, frame, signal) {
        // Signal either arrives while action is being performed or shortly after.
        if (this._currentAction) {
            this._currentAction.action.signals.push(signal);
            return;
        }
        if (this._lastAction && !this._lastAction.committed) {
            this._lastAction.action.signals.push(signal);
            this._printAction(this._lastAction, true);
            return;
        }
        if (signal.name === 'navigation') {
            this.addAction({
                pageAlias,
                frame,
                committed: true,
                action: {
                    name: 'navigate',
                    url: frame.url(),
                    signals: [],
                }
            });
        }
    }
}
exports.CodeGenerator = CodeGenerator;
//# sourceMappingURL=codeGenerator.js.map