import React, { createElement, Component } from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import { connect } from 'react-redux';
import mount, { createEphemeral, lookup, toEphemeral } from 'redux-ephemeral';

import './index.html';

export function enhanceWithPrivateProps(reducer) {
  return mount('lcl', reducer);
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

export function withProps(key, initialPrivateProps, component) {

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
      private: {...lookup(state.lcl, getPrivateKey(ownProps))},
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

  const WithSetPropsConnected = connect(
    mapStateToPrivateProps,
    mapDispatchToSetProps,
  )(WithSetProps);

  return hoistNonReactStatics(WithSetPropsConnected, component);
}
