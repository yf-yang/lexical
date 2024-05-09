/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {CollabElementNode} from './CollabElementNode';
import type {Cursor} from './SyncCursors';
import type {LexicalEditor, NodeKey} from 'lexical';
import type {Doc} from 'yjs';

import {Klass, LexicalNode} from 'lexical';
import invariant from 'shared/invariant';

import {$createCollabElementNode} from './CollabElementNode';
import {CollabNode} from './CollabNode';

export type ClientID = number;
export type Binding = {
  clientID: number;
  collabNodeMap: Map<NodeKey, CollabNode>;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: Doc;
  docMap: Map<string, Doc>;
  editor: LexicalEditor;
  id: string;
  root: CollabElementNode;
  nestedEditorPropKeys: NestedEditorPropKeys;
};
export type NestedEditorPropKeys = Map<Klass<LexicalNode>, Set<string>>;

export function createBinding(
  editor: LexicalEditor,
  id: string,
  doc: Doc | null | undefined,
  docMap: Map<string, Doc>,
  nestedEditorPropKeys?: NestedEditorPropKeys,
): Binding {
  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );
  // This map is useless, but we need to create it to satisfy the type system.
  const rootMap = doc.getMap('root');
  // Those two properties should be globally unique, so create them from doc.
  const rootProps = doc.getMap('root.props');
  const rootChildren = doc.getArray('root.children');
  rootMap.set('type', 'root');
  rootMap.set('category', 'element');
  const root: CollabElementNode = $createCollabElementNode(
    rootMap,
    null,
    'root',
  );
  root._props = rootProps;
  rootProps._collabNode = root;
  root._sharedChildren = rootChildren;
  rootChildren._collabNode = root;
  root._key = 'root';
  return {
    clientID: doc.clientID,
    collabNodeMap: new Map(),
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    id,
    nestedEditorPropKeys: nestedEditorPropKeys || new Map(),
    root,
  };
}
