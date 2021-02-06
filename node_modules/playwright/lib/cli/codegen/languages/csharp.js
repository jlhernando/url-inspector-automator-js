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
exports.CSharpLanguageGenerator = void 0;
const playwright = require("../../../..");
const recorderActions_1 = require("../recorderActions");
const utils_1 = require("../utils");
class CSharpLanguageGenerator {
    highlighterType() {
        return 'csharp';
    }
    generateAction(actionInContext, performingAction) {
        const { action, pageAlias, frame } = actionInContext;
        const formatter = new CSharpFormatter(0);
        formatter.newLine();
        formatter.add('// ' + recorderActions_1.actionTitle(action));
        if (action.name === 'openPage') {
            formatter.add(`var ${pageAlias} = await context.NewPageAsync();`);
            if (action.url && action.url !== 'about:blank' && action.url !== 'chrome://newtab/')
                formatter.add(`${pageAlias}.GoToAsync('${action.url}');`);
            return formatter.format();
        }
        const subject = !frame.parentFrame() ? pageAlias :
            `${pageAlias}.GetFrame(url: '${frame.url()}')`;
        let navigationSignal;
        let popupSignal;
        let downloadSignal;
        let dialogSignal;
        for (const signal of action.signals) {
            if (signal.name === 'navigation')
                navigationSignal = signal;
            else if (signal.name === 'popup')
                popupSignal = signal;
            else if (signal.name === 'download')
                downloadSignal = signal;
            else if (signal.name === 'dialog')
                dialogSignal = signal;
        }
        if (dialogSignal) {
            formatter.add(`    void ${pageAlias}_Dialog${dialogSignal.dialogAlias}_EventHandler(object sender, DialogEventArgs e)
      {
          Console.WriteLine($"Dialog message: {e.Dialog.Message}");
          e.Dialog.DismissAsync();
          ${pageAlias}.Dialog -= ${pageAlias}_Dialog${dialogSignal.dialogAlias}_EventHandler;
      }
      ${pageAlias}.Dialog += ${pageAlias}_Dialog${dialogSignal.dialogAlias}_EventHandler;`);
        }
        const waitForNavigation = navigationSignal && !performingAction;
        const assertNavigation = navigationSignal && performingAction;
        const emitTaskWhenAll = waitForNavigation || popupSignal || downloadSignal;
        if (emitTaskWhenAll) {
            if (popupSignal)
                formatter.add(`var ${popupSignal.popupAlias}Task = ${pageAlias}.WaitForEventAsync(PageEvent.Popup)`);
            else if (downloadSignal)
                formatter.add(`var downloadTask = ${pageAlias}.WaitForEventAsync(PageEvent.Download);`);
            formatter.add(`await Task.WhenAll(`);
        }
        // Popup signals.
        if (popupSignal)
            formatter.add(`${popupSignal.popupAlias}Task,`);
        // Navigation signal.
        if (waitForNavigation)
            formatter.add(`${pageAlias}.WaitForNavigationAsync(/*${quote(navigationSignal.url)}*/),`);
        // Download signals.
        if (downloadSignal)
            formatter.add(`downloadTask,`);
        const prefix = (popupSignal || waitForNavigation || downloadSignal) ? '' : 'await ';
        const actionCall = this._generateActionCall(action);
        const suffix = emitTaskWhenAll ? ');' : ';';
        formatter.add(`${prefix}${subject}.${actionCall}${suffix}`);
        if (assertNavigation)
            formatter.add(`  // Assert.Equal(${quote(navigationSignal.url)}, ${pageAlias}.Url);`);
        return formatter.format();
    }
    _generateActionCall(action) {
        switch (action.name) {
            case 'openPage':
                throw Error('Not reached');
            case 'closePage':
                return 'CloseAsync()';
            case 'click': {
                let method = 'ClickAsync';
                if (action.clickCount === 2)
                    method = 'DblClickAsync';
                const modifiers = utils_1.toModifiers(action.modifiers);
                const options = {};
                if (action.button !== 'left')
                    options.button = action.button;
                if (modifiers.length)
                    options.modifiers = modifiers;
                if (action.clickCount > 2)
                    options.clickCount = action.clickCount;
                const optionsString = formatOptions(options, true, false);
                return `${method}(${quote(action.selector)}${optionsString})`;
            }
            case 'check':
                return `CheckAsync(${quote(action.selector)})`;
            case 'uncheck':
                return `UncheckAsync(${quote(action.selector)})`;
            case 'fill':
                return `FillAsync(${quote(action.selector)}, ${quote(action.text)})`;
            case 'setInputFiles':
                return `SetInputFilesAsync(${quote(action.selector)}, ${formatObject(action.files.length === 1 ? action.files[0] : action.files)})`;
            case 'press': {
                const modifiers = utils_1.toModifiers(action.modifiers);
                const shortcut = [...modifiers, action.key].join('+');
                return `PressAsync(${quote(action.selector)}, ${quote(shortcut)})`;
            }
            case 'navigate':
                return `GoToAsync(${quote(action.url)})`;
            case 'select':
                return `SelectOptionAsync(${quote(action.selector)}, ${formatObject(action.options.length > 1 ? action.options : action.options[0])})`;
        }
    }
    generateHeader(browserName, launchOptions, contextOptions, deviceName) {
        const formatter = new CSharpFormatter(0);
        formatter.add(`
      await Playwright.InstallAsync();
      using var playwright = await Playwright.CreateAsync();
      await using var browser = await playwright.${toPascal(browserName)}.LaunchAsync(${formatArgs(launchOptions)});
      var context = await browser.NewContextAsync(${formatContextOptions(contextOptions, deviceName)});`);
        return formatter.format();
    }
    generateFooter(saveStorage) {
        const storageStateLine = saveStorage ? `\nawait context.StorageStateAsync(path: "${saveStorage}");` : '';
        return `// ---------------------${storageStateLine}`;
    }
}
exports.CSharpLanguageGenerator = CSharpLanguageGenerator;
function formatValue(value) {
    if (value === false)
        return 'false';
    if (value === true)
        return 'true';
    if (value === undefined)
        return 'null';
    if (Array.isArray(value))
        return `new [] {${value.map(formatValue).join(', ')}}`;
    if (typeof value === 'string')
        return quote(value);
    return String(value);
}
function formatOptions(value, hasArguments, isInitializing) {
    const keys = Object.keys(value);
    if (!keys.length)
        return '';
    return (hasArguments ? ', ' : '') + keys.map(key => `${key}${isInitializing ? ': ' : ' = '}${formatValue(value[key])}`).join(', ');
}
function formatArgs(value, indent = '    ') {
    if (typeof value === 'string')
        return quote(value);
    if (Array.isArray(value))
        return `new [] {${value.map(o => formatObject(o)).join(', ')}}`;
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (!keys.length)
            return '';
        const tokens = [];
        for (const key of keys)
            tokens.push(`${keys.length !== 1 ? indent : ''}${key}: ${formatObject(value[key], indent, key)}`);
        if (keys.length === 1)
            return `${tokens.join(`,\n${indent}`)}`;
        else
            return `\n${indent}${tokens.join(`,\n${indent}`)}`;
    }
    return String(value);
}
function formatObject(value, indent = '    ', name = '') {
    if (typeof value === 'string') {
        if (name === 'permissions' || name === 'colorScheme')
            return `${getClassName(name)}.${toPascal(value)}`;
        return quote(value);
    }
    if (Array.isArray(value))
        return `new[] { ${value.map(o => formatObject(o, indent, name)).join(', ')} }`;
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (!keys.length)
            return '';
        const tokens = [];
        for (const key of keys)
            tokens.push(`${toPascal(key)} = ${formatObject(value[key], indent, key)},`);
        if (name)
            return `new ${getClassName(name)}\n{\n${indent}${tokens.join(`\n${indent}`)}\n${indent}}`;
        return `{\n${indent}${tokens.join(`\n${indent}`)}\n${indent}}`;
    }
    if (name === 'latitude' || name === 'longitude')
        return String(value) + 'm';
    return String(value);
}
function getClassName(value) {
    switch (value) {
        case 'viewport': return 'ViewportSize';
        case 'proxy': return 'ProxySettings';
        case 'permissions': return 'ContextPermission';
        default: return toPascal(value);
    }
}
function toPascal(value) {
    return value[0].toUpperCase() + value.slice(1);
}
function formatContextOptions(options, deviceName) {
    const device = deviceName && playwright.devices[deviceName];
    if (!device)
        return formatArgs(options);
    // Filter out all the properties from the device descriptor.
    const cleanedOptions = {};
    for (const property in options) {
        if (device[property] !== options[property])
            cleanedOptions[property] = options[property];
    }
    const serializedObject = formatObject(cleanedOptions, '    ');
    // When there are no additional context options, we still want to spread the device inside.
    if (!serializedObject)
        return `playwright.Devices["${deviceName}"]`;
    let result = `new BrowserContextOptions(playwright.Devices["${deviceName}"])`;
    if (serializedObject) {
        const lines = serializedObject.split('\n');
        result = `${result} \n${lines.join('\n')}`;
    }
    return result;
}
class CSharpFormatter {
    constructor(offset = 0) {
        this._lines = [];
        this._baseIndent = ' '.repeat(4);
        this._baseOffset = ' '.repeat(offset);
    }
    prepend(text) {
        this._lines = text.trim().split('\n').map(line => line.trim()).concat(this._lines);
    }
    add(text) {
        this._lines.push(...text.trim().split('\n').map(line => line.trim()));
    }
    newLine() {
        this._lines.push('');
    }
    format() {
        let spaces = '';
        let previousLine = '';
        return this._lines.map((line) => {
            if (line === '')
                return line;
            if (line.startsWith('}') || line.startsWith(']') || line.includes('});'))
                spaces = spaces.substring(this._baseIndent.length);
            const extraSpaces = /^(for|while|if).*\(.*\)$/.test(previousLine) ? this._baseIndent : '';
            previousLine = line;
            line = spaces + extraSpaces + line;
            if (line.endsWith('{') || line.endsWith('[') || line.endsWith('('))
                spaces += this._baseIndent;
            if (line.endsWith('});'))
                spaces = spaces.substring(this._baseIndent.length);
            return this._baseOffset + line;
        }).join('\n');
    }
}
function quote(text) {
    return `"${text.replace(/["]/g, '\\"')}"`;
}
//# sourceMappingURL=csharp.js.map