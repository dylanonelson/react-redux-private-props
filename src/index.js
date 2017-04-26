import React, { createElement, Component } from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import { connect } from 'react-redux';

import './index.html';

const PRIVATE_PROPS_NAMESPACE = '@private-props';

export function privatePropsReducer(state = {}, action) {
  const namespaceRegex = new RegExp(`^${PRIVATE_PROPS_NAMESPACE}`);
  if (!namespaceRegex.test(action.type)) return state;

  const newState = Object.assign({}, state);
  const { privateKey } = action.payload;
  if (!newState[privateKey]) newState[privateKey] = {};
  const prevPrivate = newState[privateKey];
  newState[privateKey] = Object.assign({}, prevPrivate, action.payload.updates);

  return newState;
}

export function withProps(key, component) {

  let firstRun = true;

  const getPrivateKey = (props) => {
    let result;

    if (firstRun) {
      result = typeof key === 'function' ?
        key(props) :
        key;
    }

    return result;
  }

  class WithSetProps extends Component {
    constructor(props, context) {
      super(props, context);
      if (!props.store && !context.store)
        throw new Error('Yo!');

      // Set private key for this component.
      this.privateKey = getPrivateKey(props);
    }

    getStore() {
      return this.props.store || this.context.store;
    }

    setProps(updates) {
      this.getStore().dispatch({
        type: `${PRIVATE_PROPS_NAMESPACE}/SET_PROPS`,
        payload: {
          privateKey: this.privateKey,
          updates,
        },
      });
    }

    getPrivatePropsFromState() {
      return this.getStore().getState().private[this.privateKey] || {};
    }

    render() {
      const props = Object.assign({}, this.props, {
        private: this.getPrivatePropsFromState(),
        setPrivate: this.setProps.bind(this),
      });

      return createElement(component, props);
    }
  }

  WithSetProps.contextTypes = {
    store: React.PropTypes.object,
  };

  WithSetProps.propTypes = {
    store: React.PropTypes.object,
  };

  const WithSetPropsConnected = connect(
    function mapStateToProps(state, ownProps) {
      return state.private[getPrivateKey(ownProps)] || {};
    }
  )(WithSetProps);

  return hoistNonReactStatics(WithSetPropsConnected, component);
}
