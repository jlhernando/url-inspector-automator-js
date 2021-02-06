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
exports.FlushingTerminalOutput = exports.TerminalOutput = exports.FileOutput = exports.BufferOutput = exports.OutputMultiplexer = void 0;
const fs = require("fs");
const querystring = require("querystring");
const hljs = require("../../third_party/highlightjs/highlightjs");
class OutputMultiplexer {
    constructor(outputs) {
        this._outputs = outputs;
    }
    printLn(text) {
        for (const output of this._outputs)
            output.printLn(text);
    }
    popLn(text) {
        for (const output of this._outputs)
            output.popLn(text);
    }
    flush() {
        for (const output of this._outputs)
            output.flush();
    }
}
exports.OutputMultiplexer = OutputMultiplexer;
class BufferOutput {
    constructor() {
        this.lines = [];
    }
    printLn(text) {
        this.lines.push(...text.trimEnd().split('\n'));
    }
    popLn(text) {
        this.lines.length -= text.trimEnd().split('\n').length;
    }
    buffer() {
        return this.lines.join('\n');
    }
}
exports.BufferOutput = BufferOutput;
class FileOutput extends BufferOutput {
    constructor(fileName) {
        super();
        this._fileName = fileName;
    }
    flush() {
        fs.writeFileSync(this._fileName, this.buffer());
    }
}
exports.FileOutput = FileOutput;
class TerminalOutput {
    constructor(output, language) {
        this._output = output;
        this._language = language;
    }
    static create(output, language) {
        if (process.stdout.columns)
            return new TerminalOutput(output, language);
        return new FlushingTerminalOutput(output);
    }
    _highlight(text) {
        let highlightedCode = hljs.highlight(this._language, text).value;
        highlightedCode = querystring.unescape(highlightedCode);
        highlightedCode = highlightedCode.replace(/<span class="hljs-keyword">/g, '\x1b[38;5;205m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-built_in">/g, '\x1b[38;5;220m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-literal">/g, '\x1b[38;5;159m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-title">/g, '');
        highlightedCode = highlightedCode.replace(/<span class="hljs-number">/g, '\x1b[38;5;78m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-string">/g, '\x1b[38;5;130m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-comment">/g, '\x1b[38;5;23m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-subst">/g, '\x1b[38;5;242m');
        highlightedCode = highlightedCode.replace(/<span class="hljs-function">/g, '');
        highlightedCode = highlightedCode.replace(/<span class="hljs-params">/g, '');
        highlightedCode = highlightedCode.replace(/<span class="hljs-attr">/g, '');
        highlightedCode = highlightedCode.replace(/<\/span>/g, '\x1b[0m');
        highlightedCode = highlightedCode.replace(/&#x27;/g, "'");
        highlightedCode = highlightedCode.replace(/&quot;/g, '"');
        highlightedCode = highlightedCode.replace(/&gt;/g, '>');
        highlightedCode = highlightedCode.replace(/&lt;/g, '<');
        highlightedCode = highlightedCode.replace(/&amp;/g, '&');
        return highlightedCode;
    }
    printLn(text) {
        // Split into lines for highlighter to not fail.
        for (const line of text.split('\n'))
            this._output.write(this._highlight(line) + '\n');
    }
    popLn(text) {
        const terminalWidth = process.stdout.columns || 80;
        for (const line of text.split('\n')) {
            const terminalLines = ((line.length - 1) / terminalWidth | 0) + 1;
            for (let i = 0; i < terminalLines; ++i)
                this._output.write('\u001B[1A\u001B[2K');
        }
    }
    flush() { }
}
exports.TerminalOutput = TerminalOutput;
class FlushingTerminalOutput extends BufferOutput {
    constructor(output) {
        super();
        this._output = output;
    }
    printLn(text) {
        super.printLn(text);
        this._output.write('-------------8<-------------\n');
        this._output.write(this.buffer() + '\n');
        this._output.write('-------------8<-------------\n');
    }
    flush() {
        this._output.write(this.buffer() + '\n');
    }
}
exports.FlushingTerminalOutput = FlushingTerminalOutput;
//# sourceMappingURL=outputs.js.map