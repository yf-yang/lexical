/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {CollabElementNode} from './CollabElementNode';
import type {DecoratorNode, NodeMap} from 'lexical';
import type {Map as YMap} from 'yjs';

import {$getNodeByKey, $isDecoratorNode} from 'lexical';
import invariant from 'shared/invariant';

import {CollabNode} from './CollabNode';

export class CollabDecoratorNode extends CollabNode {
  constructor(
    sharedMap: null | YMap<unknown>,
    parent: null | CollabElementNode,
    type: string,
  ) {
    super(sharedMap, parent, type, 'decorator');
    this._key = '';
  }

  getPrevNode(nodeMap: null | NodeMap): null | DecoratorNode<unknown> {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getNode(): null | DecoratorNode<unknown> {
    const node = $getNodeByKey(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getCursorYjsType(): never {
    invariant(false, 'getCursorYjsType: not a valid cursor type');
  }
}

export function $createCollabDecoratorNode(
  sharedMap: null | YMap<unknown>,
  parent: CollabElementNode,
  type: string,
): CollabDecoratorNode {
  return new CollabDecoratorNode(sharedMap, parent, type);
}
