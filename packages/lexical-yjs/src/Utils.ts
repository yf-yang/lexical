/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding} from '.';
import type {
  ElementNode,
  LexicalNode,
  NodeMap,
  RangeSelection,
  SerializedLexicalNode,
  SerializedTextNode,
} from 'lexical';

import {
  $getEditor,
  $getNodeByKey,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRootNode,
  $isTextNode,
  NodeKey,
} from 'lexical';
import invariant from 'shared/invariant';
import {Map as YMap} from 'yjs';

import {
  $createCollabDecoratorNode,
  CollabDecoratorNode,
} from './CollabDecoratorNode';
import {$createCollabElementNode, CollabElementNode} from './CollabElementNode';
import {
  $createCollabLineBreakNode,
  CollabLineBreakNode,
} from './CollabLineBreakNode';
import {CollabNode} from './CollabNode';
import {$createCollabTextNode, CollabTextNode} from './CollabTextNode';

// function isNestedEditorProp(
//   name: string,
//   node: LexicalNode,
//   binding: Binding,
// ): boolean {
//   const nodeKlass = node.constructor;
//   const nestedEditorPropKeys = binding.nestedEditorPropKeys.get(nodeKlass);
//   return nestedEditorPropKeys != null && nestedEditorPropKeys.has(name);
// }

export function $getNodeByKeyOrThrow(key: NodeKey): LexicalNode {
  const node = $getNodeByKey(key);
  invariant(node !== null, 'could not find node by key');
  return node;
}

export function $createCollabNodeFromLexicalNode(
  binding: Binding,
  lexicalNode: LexicalNode,
  parent: CollabElementNode,
):
  | CollabElementNode
  | CollabTextNode
  | CollabDecoratorNode
  | CollabLineBreakNode {
  const nodeType = lexicalNode.__type;

  let collabNode:
    | CollabElementNode
    | CollabTextNode
    | CollabDecoratorNode
    | CollabLineBreakNode;

  if ($isElementNode(lexicalNode)) {
    collabNode = $createCollabElementNode(null, parent, nodeType);
    syncPropertiesFromLexical(collabNode, lexicalNode);
    collabNode.syncChildrenFromLexical(binding, lexicalNode, null, null, null);
  } else if ($isTextNode(lexicalNode)) {
    collabNode = $createCollabTextNode(null, parent, nodeType);
    syncPropertiesFromLexical(collabNode, lexicalNode);
    collabNode.syncTextFromLexical(lexicalNode, null);
  } else if ($isLineBreakNode(lexicalNode)) {
    collabNode = $createCollabLineBreakNode(null, parent, nodeType);
    syncPropertiesFromLexical(collabNode, lexicalNode);
  } else if ($isDecoratorNode(lexicalNode)) {
    collabNode = $createCollabDecoratorNode(null, parent, nodeType);
    syncPropertiesFromLexical(collabNode, lexicalNode);
  } else {
    invariant(false, 'Expected text, element, decorator, or linebreak node');
  }

  collabNode._key = lexicalNode.__key;
  return collabNode;
}

function getNodeTypeFromSharedMap(sharedMap: YMap<unknown>): string {
  const type = sharedMap.get('type') as undefined | null | string;
  invariant(type != null, 'Expected shared map to include type attribute');
  return type;
}

function getNodeCategoryFromSharedMap(sharedMap: YMap<unknown>): string {
  const category = sharedMap.get('category') as undefined | null | string;
  invariant(
    category != null,
    'Expected shared type to include category attribute',
  );
  return category;
}

export function $getOrInitCollabNodeFromSharedMap(
  binding: Binding,
  sharedMap: YMap<unknown>,
  parent?: CollabElementNode,
): CollabNode {
  const collabNode = sharedMap._collabNode;

  if (collabNode === undefined) {
    const registeredNodes = binding.editor._nodes;
    const type = getNodeTypeFromSharedMap(sharedMap);
    const category = getNodeCategoryFromSharedMap(sharedMap);
    const nodeInfo = registeredNodes.get(type);
    invariant(nodeInfo !== undefined, 'Node %s is not registered', type);

    // sharedMap's parent should normally be another CollabElementNode's sharedMap's children YArray
    // sharedMap's parent's parent should be the CollabElementNode's sharedMap
    let sharedParent: null | YMap<unknown> = null;
    if (sharedMap.parent) {
      sharedParent = (sharedMap.parent.parent as null | YMap<unknown>) || null;
    }
    const targetParent =
      parent === undefined && sharedParent !== null
        ? $getOrInitCollabNodeFromSharedMap(binding, sharedParent)
        : parent || null;

    invariant(
      targetParent instanceof CollabElementNode,
      'Expected parent to be a collab element node',
    );

    switch (category) {
      case 'element': {
        const collabElementNode = $createCollabElementNode(
          sharedMap,
          targetParent,
          type,
        );
        if (collabElementNode._sharedChildren.length > 0) {
          collabElementNode.applyChildrenYjsDelta(binding, [
            {insert: collabElementNode._sharedChildren},
          ]);
        }
        return collabElementNode;
      }
      case 'text':
        return $createCollabTextNode(sharedMap, targetParent, type);
      case 'decorator':
        return $createCollabDecoratorNode(sharedMap, targetParent, type);
      case 'linebreak':
        return $createCollabLineBreakNode(sharedMap, targetParent, type);
      default:
        invariant(false, 'Unknown category %s', category);
    }
  }
  return collabNode;
}
/** @deprecated renamed to $getOrInitCollabNodeFromSharedMap by @lexical/eslint-plugin rules-of-lexical */
export const getOrInitCollabNodeFromSharedMap = $getOrInitCollabNodeFromSharedMap;

export function $createLexicalNodeFromCollabNode(
  binding: Binding,
  collabNode: CollabNode,
  parentKey: NodeKey,
): LexicalNode {
  const type = collabNode.getType();

  const editor = $getEditor();
  const registeredNodes = editor._nodes;
  const nodeInfo = registeredNodes.get(type);
  invariant(nodeInfo !== undefined, 'Node %s is not registered', type);

  const props = collabNode._props.toJSON() as SerializedLexicalNode;
  if (collabNode instanceof CollabTextNode) {
    (props as SerializedTextNode).text = collabNode._text.toJSON();
  }
  // if (collabNode instanceof CollabElementNode) {
  //   // the children prop is not actually used by importJSON. Nothing to do.
  // }

  const lexicalNode = nodeInfo.klass.importJSON(props);
  lexicalNode.__parent = parentKey;
  collabNode._key = lexicalNode.__key;

  if (collabNode instanceof CollabElementNode) {
    collabNode.syncChildrenFromYjs(binding);
  }

  binding.collabNodeMap.set(lexicalNode.__key, collabNode);
  return lexicalNode;
}
/** @deprecated renamed to $createLexicalNodeFromCollabNode by @lexical/eslint-plugin rules-of-lexical */
export const createLexicalNodeFromCollabNode = $createLexicalNodeFromCollabNode;

export function $updateNodeFromYjs(collabNode: CollabNode): void {
  const prevLexicalNode = collabNode.getNode();
  invariant(prevLexicalNode !== null, 'updateNodeFromYjs: could not find node');

  const type = collabNode._type;
  const props = collabNode._props.toJSON() as SerializedLexicalNode;

  const editor = $getEditor();
  const registeredNodes = editor._nodes;
  const cloneNotNeeded = editor._cloneNotNeeded;
  const activeEditorState = editor._pendingEditorState;
  invariant(activeEditorState !== null, 'Expected active editor state');
  const activeNodeMap = activeEditorState._nodeMap;

  const nodeInfo = registeredNodes.get(type);
  invariant(nodeInfo !== undefined, 'Node %s is not registered', type);

  if (collabNode instanceof CollabTextNode) {
    (props as SerializedTextNode).text = collabNode._text.toJSON();
  }
  // if (category === 'element') {
  //   // the children prop is not actually used by importJSON. Nothing to do.
  // }

  const nextLexicalNode = nodeInfo.klass.importJSON(props);
  if ($isRootNode(nextLexicalNode) && $isRootNode(prevLexicalNode)) {
    // root node will never be copied
    return;
  }

  cloneNotNeeded.delete(nextLexicalNode.__key);
  activeNodeMap.delete(nextLexicalNode.__key);

  // Replace the legacy node with the new node
  nextLexicalNode.__key = prevLexicalNode.__key;
  activeNodeMap.set(nextLexicalNode.__key, nextLexicalNode);
  cloneNotNeeded.add(nextLexicalNode.__key);

  nextLexicalNode.__next = prevLexicalNode.__next;
  nextLexicalNode.__prev = prevLexicalNode.__prev;
  nextLexicalNode.__parent = prevLexicalNode.__parent;

  if ($isElementNode(nextLexicalNode) && $isElementNode(prevLexicalNode)) {
    nextLexicalNode.__first = prevLexicalNode.__first;
    nextLexicalNode.__last = prevLexicalNode.__last;
    nextLexicalNode.__size = prevLexicalNode.__size;
  }
}
/** @deprecated renamed to $updateNodeFromYjs by @lexical/eslint-plugin rules-of-lexical */
export const updateNodeFromYjs = $updateNodeFromYjs;

export function syncPropertiesFromLexical(
  collabNode: CollabNode,
  lexicalNode: LexicalNode,
): void {
  // @ts-expect-error
  const {type, children, text, ...nextProps} = lexicalNode.exportJSON();

  // Those properties are removed from the yjs payload.
  void type;
  void children;
  void text;

  const prevPropsYMap = collabNode._props;
  const prevPropsKeys = new Set(prevPropsYMap.keys());

  for (const [propKey, propValue] of Object.entries(nextProps)) {
    const prevValue = prevPropsYMap.get(propKey);
    // We update the value by shallow comparison
    if (prevValue !== propValue) {
      prevPropsYMap.set(propKey, propValue);
    }
    // The key is already updated, so we remove it from the set
    prevPropsKeys.delete(propKey);
  }

  // Remaining keys in prevPropsKeys are no longer present
  for (const key of prevPropsKeys) {
    prevPropsYMap.delete(key);
  }

  // TODO: handle nested editor
}

export function doesSelectionNeedRecovering(
  selection: RangeSelection,
): boolean {
  const anchor = selection.anchor;
  const focus = selection.focus;
  let recoveryNeeded = false;

  try {
    const anchorNode = anchor.getNode();
    const focusNode = focus.getNode();

    if (
      // We might have removed a node that no longer exists
      !anchorNode.isAttached() ||
      !focusNode.isAttached() ||
      // If we've split a node, then the offset might not be right
      ($isTextNode(anchorNode) &&
        anchor.offset > anchorNode.getTextContentSize()) ||
      ($isTextNode(focusNode) && focus.offset > focusNode.getTextContentSize())
    ) {
      recoveryNeeded = true;
    }
  } catch (e) {
    // Sometimes checking nor a node via getNode might trigger
    // an error, so we need recovery then too.
    recoveryNeeded = true;
  }

  return recoveryNeeded;
}

export function syncWithTransaction(binding: Binding, fn: () => void): void {
  binding.doc.transact(fn, binding);
}

export function $createChildrenArray(
  element: ElementNode,
  nodeMap: null | NodeMap,
): Array<NodeKey> {
  const children = [];
  let nodeKey = element.__first;
  while (nodeKey !== null) {
    const node =
      nodeMap === null ? $getNodeByKey(nodeKey) : nodeMap.get(nodeKey);
    if (node === null || node === undefined) {
      invariant(false, 'createChildrenArray: node does not exist in nodeMap');
    }
    children.push(nodeKey);
    nodeKey = node.__next;
  }
  return children;
}
/** @deprecated renamed to $createChildrenArray by @lexical/eslint-plugin rules-of-lexical */
export const createChildrenArray = $createChildrenArray;

export function removeFromParent(node: LexicalNode): void {
  const oldParent = node.getParent();
  if (oldParent !== null) {
    const writableNode = node.getWritable();
    const writableParent = oldParent.getWritable();
    const prevSibling = node.getPreviousSibling();
    const nextSibling = node.getNextSibling();
    // TODO: this function duplicates a bunch of operations, can be simplified.
    if (prevSibling === null) {
      if (nextSibling !== null) {
        const writableNextSibling = nextSibling.getWritable();
        writableParent.__first = nextSibling.__key;
        writableNextSibling.__prev = null;
      } else {
        writableParent.__first = null;
      }
    } else {
      const writablePrevSibling = prevSibling.getWritable();
      if (nextSibling !== null) {
        const writableNextSibling = nextSibling.getWritable();
        writableNextSibling.__prev = writablePrevSibling.__key;
        writablePrevSibling.__next = writableNextSibling.__key;
      } else {
        writablePrevSibling.__next = null;
      }
      writableNode.__prev = null;
    }
    if (nextSibling === null) {
      if (prevSibling !== null) {
        const writablePrevSibling = prevSibling.getWritable();
        writableParent.__last = prevSibling.__key;
        writablePrevSibling.__next = null;
      } else {
        writableParent.__last = null;
      }
    } else {
      const writableNextSibling = nextSibling.getWritable();
      if (prevSibling !== null) {
        const writablePrevSibling = prevSibling.getWritable();
        writablePrevSibling.__next = writableNextSibling.__key;
        writableNextSibling.__prev = writablePrevSibling.__key;
      } else {
        writableNextSibling.__prev = null;
      }
      writableNode.__next = null;
    }
    writableParent.__size--;
    writableNode.__parent = null;
  }
}
