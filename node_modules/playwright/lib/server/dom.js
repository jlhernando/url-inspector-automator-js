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
exports.checkedTask = exports.editableTask = exports.disabledTask = exports.visibleTask = exports.getAttributeTask = exports.innerHTMLTask = exports.innerTextTask = exports.textContentTask = exports.dispatchEventTask = exports.waitForSelectorTask = exports.assertDone = exports.throwFatalDOMError = exports.InjectedScriptPollHandler = exports.ElementHandle = exports.FrameExecutionContext = void 0;
const utils_1 = require("../utils/utils");
const injectedScriptSource = require("../generated/injectedScriptSource");
const js = require("./javascript");
const progress_1 = require("./progress");
class FrameExecutionContext extends js.ExecutionContext {
    constructor(delegate, frame, world) {
        super(delegate);
        this.frame = frame;
        this.world = world;
    }
    adoptIfNeeded(handle) {
        if (handle instanceof ElementHandle && handle._context !== this)
            return this.frame._page._delegate.adoptElementHandle(handle, this);
        return null;
    }
    async evaluateInternal(pageFunction, ...args) {
        return await this.frame._page._frameManager.waitForSignalsCreatedBy(null, false /* noWaitFor */, async () => {
            return js.evaluate(this, true /* returnByValue */, pageFunction, ...args);
        });
    }
    async evaluateExpressionInternal(expression, isFunction, ...args) {
        return await this.frame._page._frameManager.waitForSignalsCreatedBy(null, false /* noWaitFor */, async () => {
            return js.evaluateExpression(this, true /* returnByValue */, expression, isFunction, ...args);
        });
    }
    async evaluateHandleInternal(pageFunction, ...args) {
        return await this.frame._page._frameManager.waitForSignalsCreatedBy(null, false /* noWaitFor */, async () => {
            return js.evaluate(this, false /* returnByValue */, pageFunction, ...args);
        });
    }
    async evaluateExpressionHandleInternal(expression, isFunction, ...args) {
        return await this.frame._page._frameManager.waitForSignalsCreatedBy(null, false /* noWaitFor */, async () => {
            return js.evaluateExpression(this, false /* returnByValue */, expression, isFunction, ...args);
        });
    }
    createHandle(remoteObject) {
        if (this.frame._page._delegate.isElementHandle(remoteObject))
            return new ElementHandle(this, remoteObject.objectId);
        return super.createHandle(remoteObject);
    }
    injectedScript() {
        if (!this._injectedScriptPromise) {
            const custom = [];
            for (const [name, { source }] of this.frame._page.selectors._engines)
                custom.push(`{ name: '${name}', engine: (${source}) }`);
            const source = `
        (() => {
        ${injectedScriptSource.source}
        return new pwExport([
          ${custom.join(',\n')}
        ]);
        })();
      `;
            this._injectedScriptPromise = this._delegate.rawEvaluate(source).then(objectId => new js.JSHandle(this, 'object', objectId));
        }
        return this._injectedScriptPromise;
    }
    async doSlowMo() {
        return this.frame._page._doSlowMo();
    }
}
exports.FrameExecutionContext = FrameExecutionContext;
class ElementHandle extends js.JSHandle {
    constructor(context, objectId) {
        super(context, 'node', objectId);
        this._objectId = objectId;
        this._context = context;
        this._page = context.frame._page;
        this._initializePreview().catch(e => { });
    }
    async _initializePreview() {
        const utility = await this._context.injectedScript();
        this._setPreview(await utility.evaluate((injected, e) => 'JSHandle@' + injected.previewNode(e), this));
    }
    asElement() {
        return this;
    }
    async _evaluateInMain(pageFunction, arg) {
        const main = await this._context.frame._mainContext();
        return main.evaluateInternal(pageFunction, [await main.injectedScript(), this, arg]);
    }
    async _evaluateInUtility(pageFunction, arg) {
        const utility = await this._context.frame._utilityContext();
        return utility.evaluateInternal(pageFunction, [await utility.injectedScript(), this, arg]);
    }
    async _evaluateHandleInUtility(pageFunction, arg) {
        const utility = await this._context.frame._utilityContext();
        return utility.evaluateHandleInternal(pageFunction, [await utility.injectedScript(), this, arg]);
    }
    async ownerFrame() {
        const frameId = await this._page._delegate.getOwnerFrame(this);
        if (!frameId)
            return null;
        const frame = this._page._frameManager.frame(frameId);
        if (frame)
            return frame;
        for (const page of this._page._browserContext.pages()) {
            const frame = page._frameManager.frame(frameId);
            if (frame)
                return frame;
        }
        return null;
    }
    async contentFrame() {
        const isFrameElement = await this._evaluateInUtility(([injected, node]) => node && (node.nodeName === 'IFRAME' || node.nodeName === 'FRAME'), {});
        if (!isFrameElement)
            return null;
        return this._page._delegate.getContentFrame(this);
    }
    async getAttribute(name) {
        return throwFatalDOMError(await this._evaluateInUtility(([injeced, node, name]) => {
            if (node.nodeType !== Node.ELEMENT_NODE)
                return 'error:notelement';
            const element = node;
            return { value: element.getAttribute(name) };
        }, name)).value;
    }
    async textContent() {
        return this._evaluateInUtility(([injected, node]) => node.textContent, {});
    }
    async innerText() {
        return throwFatalDOMError(await this._evaluateInUtility(([injected, node]) => {
            if (node.nodeType !== Node.ELEMENT_NODE)
                return 'error:notelement';
            if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml')
                return 'error:nothtmlelement';
            const element = node;
            return { value: element.innerText };
        }, {})).value;
    }
    async innerHTML() {
        return throwFatalDOMError(await this._evaluateInUtility(([injected, node]) => {
            if (node.nodeType !== Node.ELEMENT_NODE)
                return 'error:notelement';
            const element = node;
            return { value: element.innerHTML };
        }, {})).value;
    }
    async dispatchEvent(type, eventInit = {}) {
        await this._evaluateInMain(([injected, node, { type, eventInit }]) => injected.dispatchEvent(node, type, eventInit), { type, eventInit });
        await this._page._doSlowMo();
    }
    async _scrollRectIntoViewIfNeeded(rect) {
        return await this._page._delegate.scrollRectIntoViewIfNeeded(this, rect);
    }
    async _waitAndScrollIntoViewIfNeeded(progress) {
        while (progress.isRunning()) {
            assertDone(throwRetargetableDOMError(await this._waitForDisplayedAtStablePosition(progress, false /* waitForEnabled */)));
            progress.throwIfAborted(); // Avoid action that has side-effects.
            const result = throwRetargetableDOMError(await this._scrollRectIntoViewIfNeeded());
            if (result === 'error:notvisible')
                continue;
            assertDone(result);
            return;
        }
    }
    async scrollIntoViewIfNeeded(options = {}) {
        return progress_1.runAbortableTask(progress => this._waitAndScrollIntoViewIfNeeded(progress), this._page._timeoutSettings.timeout(options));
    }
    async _clickablePoint() {
        const intersectQuadWithViewport = (quad) => {
            return quad.map(point => ({
                x: Math.min(Math.max(point.x, 0), metrics.width),
                y: Math.min(Math.max(point.y, 0), metrics.height),
            }));
        };
        const computeQuadArea = (quad) => {
            // Compute sum of all directed areas of adjacent triangles
            // https://en.wikipedia.org/wiki/Polygon#Simple_polygons
            let area = 0;
            for (let i = 0; i < quad.length; ++i) {
                const p1 = quad[i];
                const p2 = quad[(i + 1) % quad.length];
                area += (p1.x * p2.y - p2.x * p1.y) / 2;
            }
            return Math.abs(area);
        };
        const [quads, metrics] = await Promise.all([
            this._page._delegate.getContentQuads(this),
            this._page.mainFrame()._utilityContext().then(utility => utility.evaluateInternal(() => ({ width: innerWidth, height: innerHeight }))),
        ]);
        if (!quads || !quads.length)
            return 'error:notvisible';
        // Allow 1x1 elements. Compensate for rounding errors by comparing with 0.99 instead.
        const filtered = quads.map(quad => intersectQuadWithViewport(quad)).filter(quad => computeQuadArea(quad) > 0.99);
        if (!filtered.length)
            return 'error:notinviewport';
        // Return the middle point of the first quad.
        const result = { x: 0, y: 0 };
        for (const point of filtered[0]) {
            result.x += point.x / 4;
            result.y += point.y / 4;
        }
        compensateHalfIntegerRoundingError(result);
        return result;
    }
    async _offsetPoint(offset) {
        const [box, border] = await Promise.all([
            this.boundingBox(),
            this._evaluateInUtility(([injected, node]) => injected.getElementBorderWidth(node), {}).catch(e => { }),
        ]);
        if (!box || !border)
            return 'error:notvisible';
        // Make point relative to the padding box to align with offsetX/offsetY.
        return {
            x: box.x + border.left + offset.x,
            y: box.y + border.top + offset.y,
        };
    }
    async _retryPointerAction(progress, actionName, waitForEnabled, action, options) {
        let retry = 0;
        // We progressively wait longer between retries, up to 500ms.
        const waitTime = [0, 20, 100, 100, 500];
        // By default, we scroll with protocol method to reveal the action point.
        // However, that might not work to scroll from under position:sticky elements
        // that overlay the target element. To fight this, we cycle through different
        // scroll alignments. This works in most scenarios.
        const scrollOptions = [
            undefined,
            { block: 'end', inline: 'end' },
            { block: 'center', inline: 'center' },
            { block: 'start', inline: 'start' },
        ];
        while (progress.isRunning()) {
            if (retry) {
                progress.log(`retrying ${actionName} action, attempt #${retry}`);
                const timeout = waitTime[Math.min(retry - 1, waitTime.length - 1)];
                if (timeout) {
                    progress.log(`  waiting ${timeout}ms`);
                    await this._evaluateInUtility(([injected, node, timeout]) => new Promise(f => setTimeout(f, timeout)), timeout);
                }
            }
            else {
                progress.log(`attempting ${actionName} action`);
            }
            const forceScrollOptions = scrollOptions[retry % scrollOptions.length];
            const result = await this._performPointerAction(progress, actionName, waitForEnabled, action, forceScrollOptions, options);
            ++retry;
            if (result === 'error:notvisible') {
                if (options.force)
                    throw new Error('Element is not visible');
                progress.log('  element is not visible');
                continue;
            }
            if (result === 'error:notinviewport') {
                if (options.force)
                    throw new Error('Element is outside of the viewport');
                progress.log('  element is outside of the viewport');
                continue;
            }
            if (typeof result === 'object' && 'hitTargetDescription' in result) {
                if (options.force)
                    throw new Error(`Element does not receive pointer events, ${result.hitTargetDescription} intercepts them`);
                progress.log(`  ${result.hitTargetDescription} intercepts pointer events`);
                continue;
            }
            return result;
        }
        return 'done';
    }
    async _performPointerAction(progress, actionName, waitForEnabled, action, forceScrollOptions, options) {
        const { force = false, position } = options;
        if (options.__testHookBeforeStable)
            await options.__testHookBeforeStable();
        if (!force) {
            const result = await this._waitForDisplayedAtStablePosition(progress, waitForEnabled);
            if (result !== 'done')
                return result;
        }
        if (options.__testHookAfterStable)
            await options.__testHookAfterStable();
        progress.log('  scrolling into view if needed');
        progress.throwIfAborted(); // Avoid action that has side-effects.
        if (forceScrollOptions) {
            await this._evaluateInUtility(([injected, node, options]) => {
                if (node.nodeType === 1 /* Node.ELEMENT_NODE */)
                    node.scrollIntoView(options);
            }, forceScrollOptions);
        }
        else {
            const scrolled = await this._scrollRectIntoViewIfNeeded(position ? { x: position.x, y: position.y, width: 0, height: 0 } : undefined);
            if (scrolled !== 'done')
                return scrolled;
        }
        progress.log('  done scrolling');
        const maybePoint = position ? await this._offsetPoint(position) : await this._clickablePoint();
        if (typeof maybePoint === 'string')
            return maybePoint;
        const point = roundPoint(maybePoint);
        if (!force) {
            if (options.__testHookBeforeHitTarget)
                await options.__testHookBeforeHitTarget();
            progress.log(`  checking that element receives pointer events at (${point.x},${point.y})`);
            const hitTargetResult = await this._checkHitTargetAt(point);
            if (hitTargetResult !== 'done')
                return hitTargetResult;
            progress.log(`  element does receive pointer events`);
        }
        await this._page._frameManager.waitForSignalsCreatedBy(progress, options.noWaitAfter, async () => {
            if (options.__testHookBeforePointerAction)
                await options.__testHookBeforePointerAction();
            progress.throwIfAborted(); // Avoid action that has side-effects.
            let restoreModifiers;
            if (options && options.modifiers)
                restoreModifiers = await this._page.keyboard._ensureModifiers(options.modifiers);
            progress.log(`  performing ${actionName} action`);
            await action(point);
            progress.log(`  ${actionName} action done`);
            progress.log('  waiting for scheduled navigations to finish');
            if (options.__testHookAfterPointerAction)
                await options.__testHookAfterPointerAction();
            if (restoreModifiers)
                await this._page.keyboard._ensureModifiers(restoreModifiers);
        }, 'input');
        progress.log('  navigations have finished');
        return 'done';
    }
    async hover(controller, options) {
        return controller.run(async (progress) => {
            const result = await this._hover(progress, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    _hover(progress, options) {
        return this._retryPointerAction(progress, 'hover', false /* waitForEnabled */, point => this._page.mouse.move(point.x, point.y), options);
    }
    async click(controller, options = {}) {
        return controller.run(async (progress) => {
            const result = await this._click(progress, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    _click(progress, options) {
        return this._retryPointerAction(progress, 'click', true /* waitForEnabled */, point => this._page.mouse.click(point.x, point.y, options), options);
    }
    async dblclick(controller, options) {
        return controller.run(async (progress) => {
            const result = await this._dblclick(progress, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    _dblclick(progress, options) {
        return this._retryPointerAction(progress, 'dblclick', true /* waitForEnabled */, point => this._page.mouse.dblclick(point.x, point.y, options), options);
    }
    async tap(controller, options = {}) {
        return controller.run(async (progress) => {
            const result = await this._tap(progress, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    _tap(progress, options) {
        return this._retryPointerAction(progress, 'tap', true /* waitForEnabled */, point => this._page.touchscreen.tap(point.x, point.y), options);
    }
    async selectOption(controller, elements, values, options) {
        return controller.run(async (progress) => {
            const result = await this._selectOption(progress, elements, values, options);
            return throwRetargetableDOMError(result);
        }, this._page._timeoutSettings.timeout(options));
    }
    async _selectOption(progress, elements, values, options) {
        const selectOptions = [...elements, ...values];
        return this._page._frameManager.waitForSignalsCreatedBy(progress, options.noWaitAfter, async () => {
            progress.throwIfAborted(); // Avoid action that has side-effects.
            progress.log('  selecting specified option(s)');
            const poll = await this._evaluateHandleInUtility(([injected, node, selectOptions]) => injected.waitForOptionsAndSelect(node, selectOptions), selectOptions);
            const pollHandler = new InjectedScriptPollHandler(progress, poll);
            const result = throwFatalDOMError(await pollHandler.finish());
            await this._page._doSlowMo();
            return result;
        });
    }
    async fill(controller, value, options = {}) {
        return controller.run(async (progress) => {
            const result = await this._fill(progress, value, options);
            assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async _fill(progress, value, options) {
        progress.log(`elementHandle.fill("${value}")`);
        return this._page._frameManager.waitForSignalsCreatedBy(progress, options.noWaitAfter, async () => {
            progress.log('  waiting for element to be visible, enabled and editable');
            const poll = await this._evaluateHandleInUtility(([injected, node, value]) => {
                return injected.waitForEnabledAndFill(node, value);
            }, value);
            const pollHandler = new InjectedScriptPollHandler(progress, poll);
            const filled = throwFatalDOMError(await pollHandler.finish());
            progress.throwIfAborted(); // Avoid action that has side-effects.
            if (filled === 'error:notconnected')
                return filled;
            progress.log('  element is visible, enabled and editable');
            if (filled === 'needsinput') {
                progress.throwIfAborted(); // Avoid action that has side-effects.
                if (value)
                    await this._page.keyboard.insertText(value);
                else
                    await this._page.keyboard.press('Delete');
            }
            else {
                assertDone(filled);
            }
            return 'done';
        }, 'input');
    }
    async selectText(options = {}) {
        return progress_1.runAbortableTask(async (progress) => {
            progress.throwIfAborted(); // Avoid action that has side-effects.
            const poll = await this._evaluateHandleInUtility(([injected, node]) => {
                return injected.waitForVisibleAndSelectText(node);
            }, {});
            const pollHandler = new InjectedScriptPollHandler(progress, poll);
            const result = throwFatalDOMError(await pollHandler.finish());
            assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async setInputFiles(controller, files, options) {
        return controller.run(async (progress) => {
            const result = await this._setInputFiles(progress, files, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async _setInputFiles(progress, files, options) {
        const multiple = throwFatalDOMError(await this._evaluateInUtility(([injected, node]) => {
            if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'INPUT')
                return 'error:notinput';
            if (!node.isConnected)
                return 'error:notconnected';
            const input = node;
            return input.multiple;
        }, {}));
        if (typeof multiple === 'string')
            return multiple;
        utils_1.assert(multiple || files.length <= 1, 'Non-multiple file input can only accept single file!');
        await this._page._frameManager.waitForSignalsCreatedBy(progress, options.noWaitAfter, async () => {
            progress.throwIfAborted(); // Avoid action that has side-effects.
            await this._page._delegate.setInputFiles(this, files);
        });
        await this._page._doSlowMo();
        return 'done';
    }
    async focus() {
        await progress_1.runAbortableTask(async (progress) => {
            const result = await this._focus(progress);
            await this._page._doSlowMo();
            return assertDone(throwRetargetableDOMError(result));
        }, 0);
    }
    async _focus(progress, resetSelectionIfNotFocused) {
        progress.throwIfAborted(); // Avoid action that has side-effects.
        const result = await this._evaluateInUtility(([injected, node, resetSelectionIfNotFocused]) => injected.focusNode(node, resetSelectionIfNotFocused), resetSelectionIfNotFocused);
        return throwFatalDOMError(result);
    }
    async type(controller, text, options) {
        return controller.run(async (progress) => {
            const result = await this._type(progress, text, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async _type(progress, text, options) {
        progress.log(`elementHandle.type("${text}")`);
        return this._page._frameManager.waitForSignalsCreatedBy(progress, options.noWaitAfter, async () => {
            const result = await this._focus(progress, true /* resetSelectionIfNotFocused */);
            if (result !== 'done')
                return result;
            progress.throwIfAborted(); // Avoid action that has side-effects.
            await this._page.keyboard.type(text, options);
            return 'done';
        }, 'input');
    }
    async press(controller, key, options) {
        return controller.run(async (progress) => {
            const result = await this._press(progress, key, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async _press(progress, key, options) {
        progress.log(`elementHandle.press("${key}")`);
        return this._page._frameManager.waitForSignalsCreatedBy(progress, options.noWaitAfter, async () => {
            const result = await this._focus(progress, true /* resetSelectionIfNotFocused */);
            if (result !== 'done')
                return result;
            progress.throwIfAborted(); // Avoid action that has side-effects.
            await this._page.keyboard.press(key, options);
            return 'done';
        }, 'input');
    }
    async check(controller, options) {
        return controller.run(async (progress) => {
            const result = await this._setChecked(progress, true, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async uncheck(controller, options) {
        return controller.run(async (progress) => {
            const result = await this._setChecked(progress, false, options);
            return assertDone(throwRetargetableDOMError(result));
        }, this._page._timeoutSettings.timeout(options));
    }
    async _setChecked(progress, state, options) {
        if (await this._evaluateInUtility(([injected, node]) => injected.isCheckboxChecked(node), {}) === state)
            return 'done';
        const result = await this._click(progress, options);
        if (result !== 'done')
            return result;
        if (await this._evaluateInUtility(([injected, node]) => injected.isCheckboxChecked(node), {}) !== state)
            throw new Error('Unable to click checkbox');
        return 'done';
    }
    async boundingBox() {
        return this._page._delegate.getBoundingBox(this);
    }
    async screenshot(options = {}) {
        return progress_1.runAbortableTask(progress => this._page._screenshotter.screenshotElement(progress, this, options), this._page._timeoutSettings.timeout(options));
    }
    async $(selector) {
        return this._page.selectors._query(this._context.frame, selector, this);
    }
    async $$(selector) {
        return this._page.selectors._queryAll(this._context.frame, selector, this, true /* adoptToMain */);
    }
    async _$evalExpression(selector, expression, isFunction, arg) {
        const handle = await this._page.selectors._query(this._context.frame, selector, this);
        if (!handle)
            throw new Error(`Error: failed to find element matching selector "${selector}"`);
        const result = await handle._evaluateExpression(expression, isFunction, true, arg);
        handle.dispose();
        return result;
    }
    async _$$evalExpression(selector, expression, isFunction, arg) {
        const arrayHandle = await this._page.selectors._queryArray(this._context.frame, selector, this);
        const result = await arrayHandle._evaluateExpression(expression, isFunction, true, arg);
        arrayHandle.dispose();
        return result;
    }
    async isVisible() {
        return this._evaluateInUtility(([injected, node]) => {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            return element ? injected.isVisible(element) : false;
        }, {});
    }
    async isHidden() {
        return !(await this.isVisible());
    }
    async isEnabled() {
        return !(await this.isDisabled());
    }
    async isDisabled() {
        return this._evaluateInUtility(([injected, node]) => {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            return element ? injected.isElementDisabled(element) : false;
        }, {});
    }
    async isEditable() {
        return this._evaluateInUtility(([injected, node]) => {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            return element ? !injected.isElementDisabled(element) && !injected.isElementReadOnly(element) : false;
        }, {});
    }
    async isChecked() {
        return this._evaluateInUtility(([injected, node]) => {
            return injected.isCheckboxChecked(node);
        }, {});
    }
    async waitForElementState(state, options = {}) {
        return progress_1.runAbortableTask(async (progress) => {
            progress.log(`  waiting for element to be ${state}`);
            if (state === 'visible') {
                const poll = await this._evaluateHandleInUtility(([injected, node]) => {
                    return injected.waitForNodeVisible(node);
                }, {});
                const pollHandler = new InjectedScriptPollHandler(progress, poll);
                assertDone(throwRetargetableDOMError(await pollHandler.finish()));
                return;
            }
            if (state === 'hidden') {
                const poll = await this._evaluateHandleInUtility(([injected, node]) => {
                    return injected.waitForNodeHidden(node);
                }, {});
                const pollHandler = new InjectedScriptPollHandler(progress, poll);
                assertDone(await pollHandler.finish());
                return;
            }
            if (state === 'enabled') {
                const poll = await this._evaluateHandleInUtility(([injected, node]) => {
                    return injected.waitForNodeEnabled(node);
                }, {});
                const pollHandler = new InjectedScriptPollHandler(progress, poll);
                assertDone(throwRetargetableDOMError(await pollHandler.finish()));
                return;
            }
            if (state === 'disabled') {
                const poll = await this._evaluateHandleInUtility(([injected, node]) => {
                    return injected.waitForNodeDisabled(node);
                }, {});
                const pollHandler = new InjectedScriptPollHandler(progress, poll);
                assertDone(throwRetargetableDOMError(await pollHandler.finish()));
                return;
            }
            if (state === 'editable') {
                const poll = await this._evaluateHandleInUtility(([injected, node]) => {
                    return injected.waitForNodeEnabled(node, true /* waitForEnabled */);
                }, {});
                const pollHandler = new InjectedScriptPollHandler(progress, poll);
                assertDone(throwRetargetableDOMError(await pollHandler.finish()));
                return;
            }
            if (state === 'stable') {
                const rafCount = this._page._delegate.rafCountForStablePosition();
                const poll = await this._evaluateHandleInUtility(([injected, node, rafOptions]) => {
                    return injected.waitForDisplayedAtStablePosition(node, rafOptions, false /* waitForEnabled */);
                }, { rafCount, useTimeout: !!process.env.PW_USE_TIMEOUT_FOR_RAF });
                const pollHandler = new InjectedScriptPollHandler(progress, poll);
                assertDone(throwRetargetableDOMError(await pollHandler.finish()));
                return;
            }
            throw new Error(`state: expected one of (visible|hidden|stable|enabled|disabled|editable)`);
        }, this._page._timeoutSettings.timeout(options));
    }
    async waitForSelector(selector, options = {}) {
        const { state = 'visible' } = options;
        if (!['attached', 'detached', 'visible', 'hidden'].includes(state))
            throw new Error(`state: expected one of (attached|detached|visible|hidden)`);
        const info = this._page.selectors._parseSelector(selector);
        const task = waitForSelectorTask(info, state, this);
        return progress_1.runAbortableTask(async (progress) => {
            progress.log(`waiting for selector "${selector}"${state === 'attached' ? '' : ' to be ' + state}`);
            const context = await this._context.frame._context(info.world);
            const injected = await context.injectedScript();
            const pollHandler = new InjectedScriptPollHandler(progress, await task(injected));
            const result = await pollHandler.finishHandle();
            if (!result.asElement()) {
                result.dispose();
                return null;
            }
            const handle = result.asElement();
            return handle._adoptTo(await this._context.frame._mainContext());
        }, this._page._timeoutSettings.timeout(options));
    }
    async _adoptTo(context) {
        if (this._context !== context) {
            const adopted = await this._page._delegate.adoptElementHandle(this, context);
            this.dispose();
            return adopted;
        }
        return this;
    }
    async _waitForDisplayedAtStablePosition(progress, waitForEnabled) {
        if (waitForEnabled)
            progress.log(`  waiting for element to be visible, enabled and not moving`);
        else
            progress.log(`  waiting for element to be visible and not moving`);
        const rafCount = this._page._delegate.rafCountForStablePosition();
        const poll = this._evaluateHandleInUtility(([injected, node, { rafOptions, waitForEnabled }]) => {
            return injected.waitForDisplayedAtStablePosition(node, rafOptions, waitForEnabled);
        }, { rafOptions: { rafCount, useTimeout: !!process.env.PW_USE_TIMEOUT_FOR_RAF }, waitForEnabled });
        const pollHandler = new InjectedScriptPollHandler(progress, await poll);
        const result = await pollHandler.finish();
        if (waitForEnabled)
            progress.log('  element is visible, enabled and does not move');
        else
            progress.log('  element is visible and does not move');
        return result;
    }
    async _checkHitTargetAt(point) {
        const frame = await this.ownerFrame();
        if (frame && frame.parentFrame()) {
            const element = await frame.frameElement();
            const box = await element.boundingBox();
            if (!box)
                return 'error:notconnected';
            // Translate from viewport coordinates to frame coordinates.
            point = { x: point.x - box.x, y: point.y - box.y };
        }
        return this._evaluateInUtility(([injected, node, point]) => injected.checkHitTargetAt(node, point), point);
    }
}
exports.ElementHandle = ElementHandle;
// Handles an InjectedScriptPoll running in injected script:
// - streams logs into progress;
// - cancels the poll when progress cancels.
class InjectedScriptPollHandler {
    constructor(progress, poll) {
        this._progress = progress;
        this._poll = poll;
        // Ensure we cancel the poll before progress aborts and returns:
        //   - no unnecessary work in the page;
        //   - no possible side effects after progress promsie rejects.
        this._progress.cleanupWhenAborted(() => this.cancel());
        this._streamLogs();
    }
    async _streamLogs() {
        while (this._poll && this._progress.isRunning()) {
            const messages = await this._poll.evaluate(poll => poll.takeNextLogs()).catch(e => []);
            if (!this._poll || !this._progress.isRunning())
                return;
            for (const message of messages)
                this._progress.log(message);
        }
    }
    async finishHandle() {
        try {
            const result = await this._poll.evaluateHandle(poll => poll.run());
            await this._finishInternal();
            return result;
        }
        finally {
            await this.cancel();
        }
    }
    async finish() {
        try {
            const result = await this._poll.evaluate(poll => poll.run());
            await this._finishInternal();
            return result;
        }
        finally {
            await this.cancel();
        }
    }
    async _finishInternal() {
        if (!this._poll)
            return;
        // Retrieve all the logs before continuing.
        const messages = await this._poll.evaluate(poll => poll.takeLastLogs()).catch(e => []);
        for (const message of messages)
            this._progress.log(message);
    }
    async cancel() {
        if (!this._poll)
            return;
        const copy = this._poll;
        this._poll = null;
        await copy.evaluate(p => p.cancel()).catch(e => { });
        copy.dispose();
    }
}
exports.InjectedScriptPollHandler = InjectedScriptPollHandler;
function throwFatalDOMError(result) {
    if (result === 'error:notelement')
        throw new Error('Node is not an element');
    if (result === 'error:nothtmlelement')
        throw new Error('Not an HTMLElement');
    if (result === 'error:notfillableelement')
        throw new Error('Element is not an <input>, <textarea> or [contenteditable] element');
    if (result === 'error:notfillableinputtype')
        throw new Error('Input of this type cannot be filled');
    if (result === 'error:notfillablenumberinput')
        throw new Error('Cannot type text into input[type=number]');
    if (result === 'error:notvaliddate')
        throw new Error(`Malformed value`);
    if (result === 'error:notinput')
        throw new Error('Node is not an HTMLInputElement');
    if (result === 'error:notselect')
        throw new Error('Element is not a <select> element.');
    return result;
}
exports.throwFatalDOMError = throwFatalDOMError;
function throwRetargetableDOMError(result) {
    if (result === 'error:notconnected')
        throw new Error('Element is not attached to the DOM');
    return result;
}
function assertDone(result) {
    // This function converts 'done' to void and ensures typescript catches unhandled errors.
}
exports.assertDone = assertDone;
function roundPoint(point) {
    return {
        x: (point.x * 100 | 0) / 100,
        y: (point.y * 100 | 0) / 100,
    };
}
function compensateHalfIntegerRoundingError(point) {
    // Firefox internally uses integer coordinates, so 8.5 is converted to 9 when clicking.
    //
    // This does not work nicely for small elements. For example, 1x1 square with corners
    // (8;8) and (9;9) is targeted when clicking at (8;8) but not when clicking at (9;9).
    // So, clicking at (8.5;8.5) will effectively click at (9;9) and miss the target.
    //
    // Therefore, we skew half-integer values from the interval (8.49, 8.51) towards
    // (8.47, 8.49) that is rounded towards 8. This means clicking at (8.5;8.5) will
    // be replaced with (8.48;8.48) and will effectively click at (8;8).
    //
    // Other browsers use float coordinates, so this change should not matter.
    const remainderX = point.x - Math.floor(point.x);
    if (remainderX > 0.49 && remainderX < 0.51)
        point.x -= 0.02;
    const remainderY = point.y - Math.floor(point.y);
    if (remainderY > 0.49 && remainderY < 0.51)
        point.y -= 0.02;
}
function waitForSelectorTask(selector, state, root) {
    return injectedScript => injectedScript.evaluateHandle((injected, { parsed, state, root }) => {
        let lastElement;
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, root || document);
            const visible = element ? injected.isVisible(element) : false;
            if (lastElement !== element) {
                lastElement = element;
                if (!element)
                    progress.log(`  selector did not resolve to any element`);
                else
                    progress.log(`  selector resolved to ${visible ? 'visible' : 'hidden'} ${injected.previewNode(element)}`);
            }
            switch (state) {
                case 'attached':
                    return element ? element : continuePolling;
                case 'detached':
                    return !element ? undefined : continuePolling;
                case 'visible':
                    return visible ? element : continuePolling;
                case 'hidden':
                    return !visible ? undefined : continuePolling;
            }
        });
    }, { parsed: selector.parsed, state, root });
}
exports.waitForSelectorTask = waitForSelectorTask;
function dispatchEventTask(selector, type, eventInit) {
    return injectedScript => injectedScript.evaluateHandle((injected, { parsed, type, eventInit }) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            injected.dispatchEvent(element, type, eventInit);
        });
    }, { parsed: selector.parsed, type, eventInit });
}
exports.dispatchEventTask = dispatchEventTask;
function textContentTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return element.textContent;
        });
    }, selector.parsed);
}
exports.textContentTask = textContentTask;
function innerTextTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml')
                return 'error:nothtmlelement';
            return { innerText: element.innerText };
        });
    }, selector.parsed);
}
exports.innerTextTask = innerTextTask;
function innerHTMLTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return element.innerHTML;
        });
    }, selector.parsed);
}
exports.innerHTMLTask = innerHTMLTask;
function getAttributeTask(selector, name) {
    return injectedScript => injectedScript.evaluateHandle((injected, { parsed, name }) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return element.getAttribute(name);
        });
    }, { parsed: selector.parsed, name });
}
exports.getAttributeTask = getAttributeTask;
function visibleTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return injected.isVisible(element);
        });
    }, selector.parsed);
}
exports.visibleTask = visibleTask;
function disabledTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return injected.isElementDisabled(element);
        });
    }, selector.parsed);
}
exports.disabledTask = disabledTask;
function editableTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return !injected.isElementDisabled(element) && !injected.isElementReadOnly(element);
        });
    }, selector.parsed);
}
exports.editableTask = editableTask;
function checkedTask(selector) {
    return injectedScript => injectedScript.evaluateHandle((injected, parsed) => {
        return injected.pollRaf((progress, continuePolling) => {
            const element = injected.querySelector(parsed, document);
            if (!element)
                return continuePolling;
            progress.log(`  selector resolved to ${injected.previewNode(element)}`);
            return injected.isCheckboxChecked(element);
        });
    }, selector.parsed);
}
exports.checkedTask = checkedTask;
//# sourceMappingURL=dom.js.map