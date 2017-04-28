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

  return Object.assign(reducersObj, {
    [PRIVATE_PROPS_ROOT_KEY]: ephemeralReducer,
  });
}

function once(f) {
  let firstRun = true;
  let r = null;

  return (...args) => {
    if (firstRun) {
      r = f(...args);
      firstRun = false;
    }

    return r;
  }
}

function mergeStateUpdate(state, action) {
  return {...state, ...action.payload.updates};
}

function mergeSelectors(...selectors) {
  if (!selectors.find(f => typeof f === 'function'))
    return null;

  return function(...args) {
    const r = {};

    for (let i = 0; i < selectors.length; i++) {
      Object.assign(r, selectors[i](...args));
    }

    return r;
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

    const getPrivateKey =
      once(props => typeof key === 'function' ? key(props) : key);

    function mapDispatchToSetProps(dispatch) {
      return {
        setProps(updates) {
          const action = toEphemeral(
            getPrivateKey(),
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
      return {
        private: {...lookup(state[PRIVATE_PROPS_ROOT_KEY], getPrivateKey(ownProps))},
        ...ownProps,
      };
    }

    class WithSetProps extends Component {
      constructor(props, context) {
        super(props, context);
        if (!props.store && !context.store)
          throw new Error('`Store` must be accessible either in props or context');

        // Set private key for this component.
        this.privateKey = getPrivateKey(props);

        createEphemeral(this.privateKey, initialPrivateProps || {});
      }

      componentWillUnmount() {
        destroyEphemeral(this.privateKey);
      }

      getStore() {
        return this.props.store || this.context.store;
      }

      render() {
        return createElement(component, this.props);
      }
    }

    WithSetProps.contextTypes = {
      store: React.PropTypes.object,
    };

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
      mapStateToPrivateProps: finalMapStateToProps,
      mapDispatchToSetProps: finalMapDispatchToProps,
      mergeProps,
    )(WithSetProps);

    return hoistNonReactStatics(WithSetPropsConnected, component);
  }
}
