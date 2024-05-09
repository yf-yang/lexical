/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type {CollabElementNode} from './CollabElementNode';

import {LexicalNode, NodeKey} from 'lexical';
import invariant from 'shared/invariant';
import {AbstractType, Map as YMap} from 'yjs';

import {Binding} from './Bindings';

export abstract class CollabNode {
  _sharedMap!: YMap<unknown>;
  _key: NodeKey;
  _parent: CollabElementNode | null;
  _category: 'text' | 'element' | 'decorator' | 'linebreak';
  _type: string;
  _props!: YMap<unknown>;

  constructor(
    sharedMap: null | YMap<unknown>,
    parent: CollabElementNode | null,
    type: string,
    category: 'text' | 'element' | 'decorator' | 'linebreak',
  ) {
    this._key = '';
    this._type = type;
    this._category = category;
    if (sharedMap === null) {
      if (parent !== null) {
        this._sharedMap = new YMap();
        this._props = new YMap();
        this._sharedMap.set('type', type);
        this._sharedMap.set('category', category);
        this._sharedMap.set('props', this._props);
        this._props._collabNode = this;
        this._sharedMap._collabNode = this;
      }
      // if parent === null (root node), then we set _props when creating binding
    } else {
      this._sharedMap = sharedMap;
      initExistingSharedProps(this);
      this._sharedMap._collabNode = this;
    }
    this._parent = parent;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  getParent(): CollabElementNode {
    invariant(this._parent !== null, 'CollabNode: parent is null');
    return this._parent;
  }

  getNode(): null | LexicalNode {
    invariant(false, 'getNode: method not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCursorYjsType(): AbstractType<any> {
    invariant(false, 'getCursorYjsType: method not implemented');
  }

  destroy(binding: Binding): void {
    binding.collabNodeMap.delete(this._key);
  }

  // For debugging purposes
  toJSON(): Record<string, unknown> {
    return {
      category: this._category,
      key: this._key,
      props: this._props.toJSON(),
      type: this._type,
    };
  }
}

export function initExistingSharedProps(collabNode: CollabNode): void {
  const props = collabNode._sharedMap.get('props') as
    | undefined
    | null
    | YMap<unknown>;
  invariant(props != null, 'Expected shared type to include props attribute');
  collabNode._props = props;
  props._collabNode = collabNode;
}
