/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {CollabElementNode} from './src/CollabElementNode';
import {CollabNode} from './src/CollabNode';
import {CollabTextNode} from './src/CollabTextNode';

declare module 'yjs' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Map<MapType> {
    _collabNode: CollabNode;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Array<T> {
    _collabNode: CollabElementNode;
  }

  interface Text {
    _collabNode: CollabTextNode;
  }
}
