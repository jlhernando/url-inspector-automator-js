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
exports.DispatcherConnection = exports.Dispatcher = exports.lookupNullableDispatcher = exports.existingDispatcher = exports.lookupDispatcher = exports.dispatcherSymbol = void 0;
const events_1 = require("events");
const serializers_1 = require("../protocol/serializers");
const validator_1 = require("../protocol/validator");
const utils_1 = require("../utils/utils");
const validatorPrimitives_1 = require("../protocol/validatorPrimitives");
const errors_1 = require("../utils/errors");
exports.dispatcherSymbol = Symbol('dispatcher');
function lookupDispatcher(object) {
    const result = object[exports.dispatcherSymbol];
    utils_1.debugAssert(result);
    return result;
}
exports.lookupDispatcher = lookupDispatcher;
function existingDispatcher(object) {
    return object[exports.dispatcherSymbol];
}
exports.existingDispatcher = existingDispatcher;
function lookupNullableDispatcher(object) {
    return object ? lookupDispatcher(object) : undefined;
}
exports.lookupNullableDispatcher = lookupNullableDispatcher;
class Dispatcher extends events_1.EventEmitter {
    constructor(parent, object, type, initializer, isScope, guid = type + '@' + utils_1.createGuid()) {
        super();
        // Only "isScope" channel owners have registered dispatchers inside.
        this._dispatchers = new Map();
        this._disposed = false;
        this._connection = parent instanceof DispatcherConnection ? parent : parent._connection;
        this._isScope = !!isScope;
        this._parent = parent instanceof DispatcherConnection ? undefined : parent;
        this._scope = isScope ? this : this._parent;
        utils_1.assert(!this._connection._dispatchers.has(guid));
        this._connection._dispatchers.set(guid, this);
        if (this._parent) {
            utils_1.assert(!this._parent._dispatchers.has(guid));
            this._parent._dispatchers.set(guid, this);
        }
        this._type = type;
        this._guid = guid;
        this._object = object;
        object[exports.dispatcherSymbol] = this;
        if (this._parent)
            this._connection.sendMessageToClient(this._parent._guid, '__create__', { type, initializer, guid });
    }
    _dispatchEvent(method, params = {}) {
        if (this._disposed) {
            if (utils_1.isUnderTest())
                throw new Error(`${this._guid} is sending "${method}" event after being disposed`);
            // Just ignore this event outside of tests.
            return;
        }
        this._connection.sendMessageToClient(this._guid, method, params);
    }
    _dispose() {
        utils_1.assert(!this._disposed);
        // Clean up from parent and connection.
        if (this._parent)
            this._parent._dispatchers.delete(this._guid);
        this._connection._dispatchers.delete(this._guid);
        // Dispose all children.
        for (const dispatcher of [...this._dispatchers.values()])
            dispatcher._dispose();
        this._dispatchers.clear();
        if (this._isScope)
            this._connection.sendMessageToClient(this._guid, '__dispose__', {});
    }
    _debugScopeState() {
        return {
            _guid: this._guid,
            objects: Array.from(this._dispatchers.values()).map(o => o._debugScopeState()),
        };
    }
}
exports.Dispatcher = Dispatcher;
class Root extends Dispatcher {
    constructor(connection) {
        super(connection, {}, '', {}, true, '');
    }
}
class DispatcherConnection {
    constructor() {
        this._dispatchers = new Map();
        this.onmessage = (message) => { };
        this._rootDispatcher = new Root(this);
        const tChannel = (name) => {
            return (arg, path) => {
                if (arg && typeof arg === 'object' && typeof arg.guid === 'string') {
                    const guid = arg.guid;
                    const dispatcher = this._dispatchers.get(guid);
                    if (!dispatcher)
                        throw new validator_1.ValidationError(`${path}: no object with guid ${guid}`);
                    if (name !== '*' && dispatcher._type !== name)
                        throw new validator_1.ValidationError(`${path}: object with guid ${guid} has type ${dispatcher._type}, expected ${name}`);
                    return dispatcher;
                }
                throw new validator_1.ValidationError(`${path}: expected ${name}`);
            };
        };
        const scheme = validator_1.createScheme(tChannel);
        this._validateParams = (type, method, params) => {
            const name = type + method[0].toUpperCase() + method.substring(1) + 'Params';
            if (!scheme[name])
                throw new validator_1.ValidationError(`Unknown scheme for ${type}.${method}`);
            return scheme[name](params, '');
        };
        this._validateMetadata = (metadata) => {
            return validatorPrimitives_1.tOptional(scheme['Metadata'])(metadata, '');
        };
    }
    sendMessageToClient(guid, method, params) {
        this.onmessage({ guid, method, params: this._replaceDispatchersWithGuids(params) });
    }
    rootDispatcher() {
        return this._rootDispatcher;
    }
    async dispatch(message) {
        const { id, guid, method, params, metadata } = message;
        const dispatcher = this._dispatchers.get(guid);
        if (!dispatcher) {
            this.onmessage({ id, error: serializers_1.serializeError(new Error(errors_1.kBrowserOrContextClosedError)) });
            return;
        }
        if (method === 'debugScopeState') {
            this.onmessage({ id, result: this._rootDispatcher._debugScopeState() });
            return;
        }
        try {
            const validated = this._validateParams(dispatcher._type, method, params);
            if (typeof dispatcher[method] !== 'function')
                throw new Error(`Mismatching dispatcher: "${dispatcher._type}" does not implement "${method}"`);
            const result = await dispatcher[method](validated, this._validateMetadata(metadata));
            this.onmessage({ id, result: this._replaceDispatchersWithGuids(result) });
        }
        catch (e) {
            this.onmessage({ id, error: serializers_1.serializeError(e) });
        }
    }
    _replaceDispatchersWithGuids(payload) {
        if (!payload)
            return payload;
        if (payload instanceof Dispatcher)
            return { guid: payload._guid };
        if (Array.isArray(payload))
            return payload.map(p => this._replaceDispatchersWithGuids(p));
        if (typeof payload === 'object') {
            const result = {};
            for (const key of Object.keys(payload))
                result[key] = this._replaceDispatchersWithGuids(payload[key]);
            return result;
        }
        return payload;
    }
}
exports.DispatcherConnection = DispatcherConnection;
//# sourceMappingURL=dispatcher.js.map