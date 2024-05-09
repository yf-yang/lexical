/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {CollabElementNode} from './CollabElementNode';
import type {LineBreakNode} from 'lexical';
import type {Map as YMap} from 'yjs';

import {$getNodeByKey, $isLineBreakNode} from 'lexical';
import invariant from 'shared/invariant';

import {CollabNode} from './CollabNode';

export class CollabLineBreakNode extends CollabNode {
  constructor(
    sharedMap: null | YMap<unknown>,
    parent: CollabElementNode,
    type: string,
  ) {
    super(sharedMap, parent, type, 'linebreak');
  }

  getNode(): null | LineBreakNode {
    const node = $getNodeByKey(this._key);
    return $isLineBreakNode(node) ? node : null;
  }

  getCursorYjsType(): never {
    invariant(false, 'getCursorYjsType: not a valid cursor type');
  }
}

export function $createCollabLineBreakNode(
  sharedMap: null | YMap<unknown>,
  parent: CollabElementNode,
  type: string,
): CollabLineBreakNode {
  return new CollabLineBreakNode(sharedMap, parent, type);
}
