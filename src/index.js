import {
  createEphemeral,
  destroyEphemeral,
  lookup,
  toEphemeral,
  ephemeralReducer,
} from 'redux-ephemeral';
import hoistNonReactStatics from 'hoist-non-react-statics';
import React, { createElement, Component } from 'react';

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

export function withProps({
    key = null,
    initialPrivateProps = {},
} = {}) {
  return function (component) {

    // `k` is the component key, which will ultimately be derived from props
    // and context.
    let k = null;

    class WithSetProps extends Component {
      constructor(props, context) {
        super(props, context);

        if (!this.getStore())
          throw new Error(`\`Store\` must be accessible either in props or
                          context to add private props to ${component.name}`);

        this.buildKey();
        this.initializePrivateProps();
        this.initializeSubscription();
      }

      buildKey() {
        const { props, context } = this;

        k = component.name;

        k = typeof key === 'function'
          ? `${k}.${key(props)}`
          : typeof key === 'string'
          ? `${k}.${key}`
          : k;

        k = context.parentKey
          ? `${context.parentKey}.${k}`
          : k;
      }

      componentWillUnmount() {
        this.unsubscribe && this.unsubscribe();
        destroyEphemeral(k);
      }

      get privateProps() {
        if (!this._privateProps) {
          this._privateProps = {};
        }

        return this._privateProps;
      }

      getChildContext() {
        return {
          parentKey: k,
        };
      }

      getStore() {
        return this.props.store || this.context.store;
      }

      initializePrivateProps() {
        createEphemeral(k, initialPrivateProps || {});
      }

      initializeSubscription() {
        const store = this.getStore();

        this.unsubscribe = store.subscribe(() => {
          const state = store.getState();
          const privateProps = lookup(state[PRIVATE_PROPS_ROOT_KEY], k);

          if (privateProps !== this.privateProps) {
            this.privateProps = privateProps;
            // Schedule a render by setting dummy state
            this.setState({});
          }
        });
      }

      render() {
        return createElement(
          component, {
            ...this.props,
            ...{ private: this.privateProps },
            ...{ setProps: this.setProps.bind(this) },
          }
        );
      }

      set privateProps(props) {
        this._privateProps = props;
      }

      setProps(updates) {
        const action = toEphemeral(
          k,
          mergeStateUpdate,
          {
            type: 'UPDATE_PRIVATE_PROPS',
            payload: { updates },
          }
        );

        this.getStore().dispatch(action);
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

    return hoistNonReactStatics(WithSetProps, component);
  }
}
