/* __ ___ ____ _____ ______ _______ ________ _______ ______ _____ ____ ___ __


The MIT License (MIT)

Copyright (c) 2013 Martin Skinner ART+COM

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
/*globals module*/

/**
 * @namespace HSM
 */

var HSM = (function () {

    ////////////
    // Public //
    ////////////
    var Logger = { debug: function(){}, trace: function(){} };

/**
 * @callback HSM.State~EntryFunc
 * @param {HSM.State} previous state
 * @param data in event
 */
/**
 * @callback HSM.State~ExitFunc
 * @param {HSM.State} next state
 * @param data in event
 */
/**
 * A guard function may be attached to any transition. If will be called before the transition is fired. If it doesn't return true,
 * the transition will be disabled for the current event.
 * @callback HSM.State~GuardFunc
 * @param {HSM.State} source - current state
 * @param {HSM.State} target - potential next state
 * @param data - event parameters
 */
/**
 * An action function may be attached to any transition. If will be called after all exit handlers and before all entry handlers are called.
 * @callback HSM.State~ActionFunc
 * @param {HSM.State} source - current state
 * @param {HSM.State} target - next state
 * @param data - event parameters
 * @see {@link HSM.State~Handler} action
 */
/**
  @typedef {Object} HSM.State~Handler
  @property {HSM.State} next target state
  @property {HSM.State~GuardFunc=} guard - disables the transition unless returns true. 
  @property {HSM.State~ActionFunc=} action - called after all state exit handleris and before all state entry handlers are called.
*/


/**
 * Represents a State.
 * @class HSM.State
 * @static
 * @param {String} theStateID - Identifies the state. Must be unique in the containing state machine. 
 */  
    var State = function (theStateID) {
        this._id = theStateID;
        this._owner = null;
        /** Map of events to handlers. 
         * Either a single handler or an array of handlers can be given. The guard of each handler will be called
         * until a guard returns true (or a handler doesn't have a guard). This handler will then be triggered.
         * @memberof! HSM.State# 
         * @var {(HSM.State~Handler|HSM.State~Handler[])} handler[event] 
         */
        this.handler = {};
        /** @memberof! HSM.State# 
         *  @var {HSM.State~EntryFunc}
         */
        this.on_entry = undefined;
        /** @memberof! HSM.State# 
         *  @var {HSM.State~ExitFunc}
         */
        this.on_exit = undefined;
    };

    State.prototype._enter = function (thePreviousState, theData) {
        if (this.on_entry !== undefined) {
            this.on_entry.apply(this, arguments);
        }
    };
    State.prototype._exit = function (theNextState, theData) {
        if (this.on_exit !== undefined) {
            this.on_exit.apply(this, arguments);
        }
    };
    State.prototype.toString = function () {
        return this._id;
    };
    State.prototype.__defineGetter__('id', function() {
        return this._id;
    });
    State.prototype.__defineGetter__('owner', function() {
        Logger.debug("getter called for "+this._id);
        return this._owner;
    });

    State.prototype.__defineSetter__('owner', function(theOwnerMachine) {
        if (this._owner) {
            throw ("Invalid Argument - state '"+this._id+"'already owned");
        }
        this._owner = theOwnerMachine;
    });


    var Sub = function (theStateID, theSubMachine) {
        State.call(this, theStateID);
        this._subMachine = theSubMachine;
    };

    // inheritance
    Sub.prototype = Object.create(State.prototype);
    Sub.prototype.constructor = Sub;
    // old-style inheritance - causes performance warnings in newer JS engines
    // Sub.prototype.__proto__ = State.prototype;

    Sub.prototype._enter = function (thePreviousState, theData) {
        State.prototype._enter.apply(this, arguments);
        return this._subMachine.init(theData);
    };
    Sub.prototype._exit = function (theNextState, theData) {
        this._subMachine.teardown(theData);
        State.prototype._exit.apply(this, arguments);
    };
    Sub.prototype.__defineSetter__('owner', function(theOwnerMachine) {
        State.prototype.__lookupSetter__('owner').call(this, theOwnerMachine);
        this._subMachine.ancestors = this._owner.ancestors.concat([this._owner]); 
    });
    Sub.prototype._handle = function () {
        return this._subMachine._handle.apply(this._subMachine, arguments);
    };
    Sub.prototype.toString = function toString() {
        return this.id + "/(" + this._subMachine + ")";
    };
    Sub.prototype.__defineGetter__("subMachine", function () {
        return this._subMachine;
    });
    Sub.prototype.__defineGetter__("subState", function () {
        return this._subMachine.state;
    });

    var Parallel = function (theStateID, theSubMachines) {
        State.call(this, theStateID);
        this._subMachines = theSubMachines || [];
        //var subAncestors = this.owner.ancestors.concat([this.owner]);
        //for (var i = 0; i < this._subMachines.length; ++i) {
        //    this._subMachines[i].ancestors = subAncestors; 
        //}
    };
    
    // inheritance
    Parallel.prototype = Object.create(State.prototype);
    Parallel.prototype.constructor = Parallel;
    // old-style inheritance - causes performance warnings in newer JS engines
    // Parallel.prototype.__proto__ = State.prototype;

    Parallel.prototype.toString = function toString() {
        return this.id + "/(" + this._subMachines.join('|') + ")";
    };

    Parallel.prototype._enter = function (thePreviousState, theData) {
        var i;
        for (i = 0; i < this._subMachines.length; ++i) {
            this._subMachines[i].init(theData);
        }
    };
    Parallel.prototype._exit = function (theNextState, theData) {
        var i;
        for (i = 0; i < this._subMachines.length; ++i) {
            this._subMachines[i].teardown(theData);
        }
    };
    Parallel.prototype._handle = function () {
        var handled = false;
        var i;
        for (i = 0; i < this._subMachines.length; ++i) {
            if (this._subMachines[i]._handle.apply(this._subMachines[i], arguments)) {
                handled = true;
            }
        }
        return handled;
    };
    Parallel.prototype.__defineGetter__("subMachines", function () {
        return this._subMachines;
    });
    Parallel.prototype.__defineGetter__("parallelStates", function () {
        return this._subMachines.map(function(s) { return s.state; });
    });

/**
 * Represents a State Machine.
 * @class HSM.StateMachine
 * @param {HSM.State[]} theStates - the states that compose the state machine. The first state is the initial state. 
 */  
    var StateMachine = function(theStates) {
        this.states = {};
        this.ancestors = [];
        this._curState = null;
        this._eventInProgress = false;
        this._eventQueue = [];
        var i;
        for (i = 0; i  < theStates.length; ++i) {
            if (!(theStates[i] instanceof State)) {
                throw ("Invalid Argument - not a state");
            }
            this.states[theStates[i].id] = theStates[i];
            theStates[i].owner = this;
        }

        this.initialState = theStates.length ? theStates[0] : null;
    };

    StateMachine.prototype.toString = function toString() {
        if (this._curState !== null) {
            return this._curState.toString();
        }
        return "_uninitializedStatemachine_";
    };

    StateMachine.prototype.__defineGetter__('state', function () {
        return this._curState;
    });

    StateMachine.prototype._switchState = function (newState, theAction, theData) {
        Logger.debug("State transition '" + this._curState+ "' => '" + newState + "'");
        // call old state's exit handler
        if (this._curState !== null && '_exit' in this.state) {
            Logger.debug("<StateMachine::_switchState> exiting state '" + this._curState + "'");
            this.state._exit(newState, theData);
        }
        var oldState  = this._curState;
        if (theAction) { 
            theAction.apply(this, [oldState, newState].concat(theData));
        }
        this._curState = newState;
        // call new state's enter handler
        if (this._curState !== null && '_enter' in this.state) {
            Logger.debug("<StateMachine::_switchState> entering state '" + this._curState + "'");
            this.state._enter(oldState, theData);
        }
    };

    StateMachine.prototype.init = function (theData) {
        Logger.debug("<StateMachine::init> setting initial state: " + this.initialState);
        this._curState = null;
        this._switchState(this.initialState, null, theData);
        return this;
    };
    StateMachine.prototype.teardown = function () {
        this._switchState(null, null, {});
    };

    StateMachine.prototype._tryTransition = function(handler, data) {
        if ( !('guard' in handler) || handler.guard(this._curState, handler.next, data)) {
            this._switchState(handler.next, handler.action, data);
            return true;
        }
        return false;
    };

    /** 
     *  Creates a new event an passes it to the top-level state machine for handling. Aliased as handleEvent
     *  for backwards compatibility.
     *  @memberof! HSM.StateMachine#
     *  @param {string} event - event to be handled
     *  @param [data] event parameters 
     */
    StateMachine.prototype.emit = function (ev) {
        if (this.ancestors.length > 0) {
            // if we are not at the top-level state machine,
            // call again at the top-level state machine
            this.ancestors[0].emit.apply(this.ancestors[0], arguments);
        } else {
            this._eventQueue.push(arguments);
            // we are at the top-level state machine
            if (this._eventInProgress === true) {
                Logger.debug("<StateMachine>::emit: queuing event "+ev);
            } else {
                this._eventInProgress = true;
                while (this._eventQueue.length > 0) {
                    this._handle.apply(this, this._eventQueue.shift());
                }
                this._eventInProgress = false;
            }
        }
    };
    StateMachine.prototype.handleEvent = StateMachine.prototype.emit; 

    StateMachine.prototype._handle = function (ev, data) {
        Logger.debug("<StateMachine::_handle> handling event " + ev);
        var handled = false;
        var handlerResult = null;
        var nextState;

        // check if the current state is a (nested) statemachine, if so, give it the event. 
        // if it handles the event, stop processing it here.
        if ('_handle' in this.state && 
                this.state._handle.apply(this.state, arguments)) {
            return true;
        }

        if (ev in this.state.handler) {
            if (this.state.handler[ev] instanceof Array) {
                var handlers = this.state.handler[ev];
                var i;
                for (i = 0; i < handlers.length; ++i) {
                    if (this._tryTransition(handlers[i], data)) {
                        return true;
                    }
                }
                return false;
            }
            return this._tryTransition(this.state.handler[ev], data);
        }
        return false;

    };

    //////////////
    // Interface
    //////////////
    return {
        State        : State,
        Sub          : Sub,
        Parallel     : Parallel,
        StateMachine : StateMachine,
        Logger       : Logger
    };
}()); // execute outer function to produce our closure

// nodejs export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HSM;
}
