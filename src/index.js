import React, { createElement, Component } from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import { connect } from 'react-redux';
import { createEphemeral, destroyEphemeral, lookup, toEphemeral, ephemeralReducer } from 'redux-ephemeral';

import './index.html';

let PRIVATE_PROPS_ROOT_KEY = 'lcl';

export function combineWithPrivateProps(key, reducersObj) {
  if (typeof key === 'object') {
    reducersObj = key;
  } else {
    PRIVATE_PROPS_ROOT_KEY = key;
  }

  if (reducersObj[PRIVATE_PROPS_ROOT_KEY])
    throw new Error(`Reducer for key ${PRIVATE_PROPS_ROOT_KEY} is alread defined,
                    but \`combineWithPrivateProps\` needs to assign a reducer to
                    it.`);

  return Object.assign(reducersObj, {
    [PRIVATE_PROPS_ROOT_KEY]: ephemeralReducer,
  });
}

function mergeStateUpdate(state, action) {
  return {...state, ...action.payload.updates};
}

function mergeSelectors(...selectors) {
  if (!selectors.find(f => typeof f === 'function'))
    return null;

  const arity = selectors.reduce((m, f) => {
    if (f.length > m) m = f.length;
    return m;
  }, 0);

  const callSelectors = (...args) => {
    const r = {};

    for (let i = 0; i < selectors.length; i++) {
      if (typeof selectors[i] === 'function')
        Object.assign(r, selectors[i](...args));
    }

    return r;
  }

  // react-redux checks the arity of the functions passed for mapStateToProps,
  // mapDispatchToProps, and mergeProps to see whether they depend on both
  // state and props. Maintain this performance optimization by minimizing the
  // number of arguments our selector takes.
  switch(m) {
    case 1: return function(arg1, arg2) {
      return callSelectors(arg1, arg2);
    }
    case 2: return function(arg1, arg2, arg3) {
      return callSelectors(arg1, arg2, arg3);
    }
    case 3: return function(arg1, arg2, arg3) {
      return callSelectors(arg1, arg2, arg3);
    }
    // Functions with an arity of 0 receive all args by default
    case 0:
    default: return function(...args) {
      return callSelectors(...args);
    }
  }
}

export function withProps({
    key = null,
    initialPrivateProps = {},
    mapStateToProps = null,
    mapDispatchToProps = null,
    mergeProps = null,
} = {}) {
  return function (component) {

    // `k` is the component key, which will ultimately be derived from props
    // and context.
    let k = null;

    function mapDispatchToSetProps(dispatch) {
      return {
        setProps(updates) {
          const action = toEphemeral(
            k,
            mergeStateUpdate,
            {
              type: 'UPDATE_PRIVATE_PROPS',
              payload: { updates },
            }
          )

          dispatch(action);
        },
      }
    }

    function mapStateToPrivateProps(state, ownProps) {
      const privateState = k
        ? {...lookup(state[PRIVATE_PROPS_ROOT_KEY], k)}
        : initialPrivateProps;

      return {
        private: privateState,
        ...ownProps,
      };
    }

    class WithSetProps extends Component {
      constructor(props, context) {
        super(props, context);
        if (!props.store && !context.store)
          throw new Error('`Store` must be accessible either in props or context');

        k = component.name;

        k = typeof key === 'function'
          ? `${k}.${key(props)}`
          : typeof key === 'string'
          ? `${k}.${key}`
          : k;

        k = context.parentKey
          ? `${context.parentKey}.${k}`
          : k;

        createEphemeral(k, initialPrivateProps || {});
      }

      componentWillUnmount() {
        destroyEphemeral(k);
      }

      getChildContext() {
        return {
          parentKey: k,
        };
      }

      render() {
        return createElement(component, this.props);
      }
    }

    WithSetProps.contextTypes = {
      store: React.PropTypes.object,
      parentKey: React.PropTypes.string,
    };

    WithSetProps.childContextTypes = {
      parentKey: React.PropTypes.string,
    };

    WithSetProps.displayName = `WithSetProps(${component.name || 'Component'})`;

    WithSetProps.propTypes = {
      store: React.PropTypes.object,
    };

    const finalMapStateToProps = mergeSelectors(
      mapStateToProps,
      mapStateToPrivateProps
    );

    const finalMapDispatchToProps = mergeSelectors(
      mapDispatchToProps,
      mapDispatchToSetProps
    );

    const WithSetPropsConnected = connect(
      finalMapStateToProps,
      finalMapDispatchToProps,
      mergeProps
    )(WithSetProps);

    return hoistNonReactStatics(WithSetPropsConnected, component);
  }
}
