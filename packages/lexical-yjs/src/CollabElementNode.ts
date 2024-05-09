/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding} from '.';
import type {ElementNode, NodeKey, NodeMap} from 'lexical';
import type {AbstractType, Map as YMap} from 'yjs';

import {$getNodeByKey, $isElementNode, $isTextNode} from 'lexical';
import invariant from 'shared/invariant';
import {Array as YArray} from 'yjs';

import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabLineBreakNode} from './CollabLineBreakNode';
import {CollabNode} from './CollabNode';
import {CollabTextNode} from './CollabTextNode';
import {
  $createCollabNodeFromLexicalNode,
  $getNodeByKeyOrThrow,
  createChildrenArray,
  createLexicalNodeFromCollabNode,
  getOrInitCollabNodeFromSharedMap,
  removeFromParent,
  syncPropertiesFromLexical,
} from './Utils';

type IntentionallyMarkedAsDirtyElement = boolean;

export class CollabElementNode extends CollabNode {
  _children: CollabNode[];
  _sharedChildren!: YArray<unknown>;

  constructor(
    sharedMap: null | YMap<unknown>,
    parent: null | CollabElementNode,
    type: string,
  ) {
    super(sharedMap, parent, type, 'element');
    if (sharedMap === null) {
      this._sharedChildren = new YArray();
      this._sharedMap.set('children', this._sharedChildren);
      this._sharedChildren._collabNode = this;
    } else if (parent !== null) {
      initExistingSharedChildren(this);
    }
    // if parent === null (root node), then we set _sharedChildren when creating binding
    this._key = '';
    this._children = [];
  }

  getPrevNode(nodeMap: null | NodeMap): null | ElementNode {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isElementNode(node) ? node : null;
  }

  getNode(): null | ElementNode {
    const node = $getNodeByKey(this._key);
    return $isElementNode(node) ? node : null;
  }

  getCursorYjsType(): YMap<unknown> {
    return this._sharedMap;
  }

  isEmpty(): boolean {
    return this._children.length === 0;
  }

  applyChildrenYjsDelta(
    binding: Binding,
    deltas: Array<{
      insert?: string | object | AbstractType<unknown>;
      delete?: number;
      retain?: number;
      attributes?: {
        [x: string]: unknown;
      };
    }>,
  ): void {
    const children = this._children;
    let currIndex = 0;

    for (let i = 0; i < deltas.length; i++) {
      const delta = deltas[i];
      const insertDelta = delta.insert;
      const deleteDelta = delta.delete;

      if (delta.retain != null) {
        currIndex += delta.retain;
      } else if (typeof deleteDelta === 'number') {
        children.splice(currIndex, deleteDelta);
      } else if (insertDelta != null) {
        const sharedMaps = insertDelta as YMap<unknown>[];
        const collabNodes = sharedMaps.map((sharedMap) =>
          getOrInitCollabNodeFromSharedMap(binding, sharedMap, this),
        );
        children.splice(currIndex, 0, ...collabNodes);
        currIndex += 1;
      } else {
        throw new Error('Unexpected delta format');
      }
    }
  }

  syncChildrenFromYjs(binding: Binding): void {
    // Now diff the children of the collab node with that of our existing Lexical node.
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncChildrenFromYjs: could not find element node',
    );

    const key = lexicalNode.__key;
    const prevLexicalChildrenKeys = createChildrenArray(lexicalNode, null);
    const nextLexicalChildrenKeys: Array<NodeKey> = [];
    const lexicalChildrenKeysLength = prevLexicalChildrenKeys.length;
    const collabChildren = this._children;
    const collabChildrenLength = collabChildren.length;
    const collabNodeMap = binding.collabNodeMap;
    const visitedKeys = new Set();
    let collabKeys;
    let writableLexicalNode;
    let prevIndex = 0;
    let prevChildNode = null;

    if (collabChildrenLength !== lexicalChildrenKeysLength) {
      writableLexicalNode = lexicalNode.getWritable();
    }

    for (let i = 0; i < collabChildrenLength; i++) {
      const lexicalChildKey = prevLexicalChildrenKeys[prevIndex];
      const childCollabNode = collabChildren[i];
      const collabLexicalChildNode = childCollabNode.getNode();
      const collabKey = childCollabNode._key;

      if (collabLexicalChildNode !== null && lexicalChildKey === collabKey) {
        visitedKeys.add(lexicalChildKey);

        nextLexicalChildrenKeys[i] = lexicalChildKey;
        prevChildNode = collabLexicalChildNode;
        prevIndex++;
      } else {
        if (collabKeys === undefined) {
          collabKeys = new Set();

          for (let s = 0; s < collabChildrenLength; s++) {
            const child = collabChildren[s];
            const childKey = child._key;

            if (childKey !== '') {
              collabKeys.add(childKey);
            }
          }
        }

        if (
          collabLexicalChildNode !== null &&
          lexicalChildKey !== undefined &&
          !collabKeys.has(lexicalChildKey)
        ) {
          const nodeToRemove = $getNodeByKeyOrThrow(lexicalChildKey);
          removeFromParent(nodeToRemove);
          i--;
          prevIndex++;
          continue;
        }

        writableLexicalNode = lexicalNode.getWritable();
        // Create/Replace
        const lexicalChildNode = createLexicalNodeFromCollabNode(
          binding,
          childCollabNode,
          key,
        );
        const childKey = lexicalChildNode.__key;
        collabNodeMap.set(childKey, childCollabNode);
        nextLexicalChildrenKeys[i] = childKey;
        if (prevChildNode === null) {
          const nextSibling = writableLexicalNode.getFirstChild();
          writableLexicalNode.__first = childKey;
          if (nextSibling !== null) {
            const writableNextSibling = nextSibling.getWritable();
            writableNextSibling.__prev = childKey;
            lexicalChildNode.__next = writableNextSibling.__key;
          }
        } else {
          const writablePrevChildNode = prevChildNode.getWritable();
          const nextSibling = prevChildNode.getNextSibling();
          writablePrevChildNode.__next = childKey;
          lexicalChildNode.__prev = prevChildNode.__key;
          if (nextSibling !== null) {
            const writableNextSibling = nextSibling.getWritable();
            writableNextSibling.__prev = childKey;
            lexicalChildNode.__next = writableNextSibling.__key;
          }
        }
        if (i === collabChildrenLength - 1) {
          writableLexicalNode.__last = childKey;
        }
        writableLexicalNode.__size++;
        prevChildNode = lexicalChildNode;
      }
    }

    for (let i = 0; i < lexicalChildrenKeysLength; i++) {
      const lexicalChildKey = prevLexicalChildrenKeys[i];

      if (!visitedKeys.has(lexicalChildKey)) {
        // Remove
        const lexicalChildNode = $getNodeByKeyOrThrow(lexicalChildKey);
        const collabNode = binding.collabNodeMap.get(lexicalChildKey);

        if (collabNode !== undefined) {
          collabNode.destroy(binding);
        }
        removeFromParent(lexicalChildNode);
      }
    }
  }

  _syncChildFromLexical(
    binding: Binding,
    index: number,
    key: NodeKey,
    prevNodeMap: null | NodeMap,
    dirtyElements: null | Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
    dirtyLeaves: null | Set<NodeKey>,
  ): void {
    const childCollabNode = this._children[index];
    // Update
    const nextChildNode = $getNodeByKeyOrThrow(key);

    if (
      childCollabNode instanceof CollabElementNode &&
      $isElementNode(nextChildNode) &&
      (dirtyElements === null || dirtyElements.has(key))
    ) {
      // avoid calling exportJSON and compare props if the element itself is not dirty
      if (dirtyElements === null || dirtyElements.get(key)) {
        syncPropertiesFromLexical(childCollabNode, nextChildNode);
      }
      childCollabNode.syncChildrenFromLexical(
        binding,
        nextChildNode,
        prevNodeMap,
        dirtyElements,
        dirtyLeaves,
      );
    } else if (
      childCollabNode instanceof CollabTextNode &&
      $isTextNode(nextChildNode) &&
      (dirtyLeaves === null || dirtyLeaves.has(key))
    ) {
      syncPropertiesFromLexical(childCollabNode, nextChildNode);
      childCollabNode.syncTextFromLexical(nextChildNode, prevNodeMap);
    } else if (dirtyElements === null || dirtyElements.has(key)) {
      syncPropertiesFromLexical(childCollabNode, nextChildNode);
    }
  }

  syncChildrenFromLexical(
    binding: Binding,
    nextLexicalNode: ElementNode,
    prevNodeMap: null | NodeMap,
    dirtyElements: null | Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
    dirtyLeaves: null | Set<NodeKey>,
  ): void {
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const prevChildren =
      prevLexicalNode === null
        ? []
        : createChildrenArray(prevLexicalNode, prevNodeMap);
    const nextChildren = createChildrenArray(nextLexicalNode, null);
    const prevEndIndex = prevChildren.length - 1;
    const nextEndIndex = nextChildren.length - 1;
    const collabNodeMap = binding.collabNodeMap;
    let prevChildrenSet: Set<NodeKey> | undefined;
    let nextChildrenSet: Set<NodeKey> | undefined;
    let prevIndex = 0;
    let nextIndex = 0;

    while (prevIndex <= prevEndIndex && nextIndex <= nextEndIndex) {
      const prevKey = prevChildren[prevIndex];
      const nextKey = nextChildren[nextIndex];

      if (prevKey === nextKey) {
        // No move, create or remove
        this._syncChildFromLexical(
          binding,
          nextIndex,
          nextKey,
          prevNodeMap,
          dirtyElements,
          dirtyLeaves,
        );

        prevIndex++;
        nextIndex++;
      } else {
        if (prevChildrenSet === undefined) {
          prevChildrenSet = new Set(prevChildren);
        }

        if (nextChildrenSet === undefined) {
          nextChildrenSet = new Set(nextChildren);
        }

        const nextHasPrevKey = nextChildrenSet.has(prevKey);
        const prevHasNextKey = prevChildrenSet.has(nextKey);

        if (!nextHasPrevKey) {
          // Remove
          this.splice(binding, nextIndex, 1);
          prevIndex++;
        } else {
          // Create or replace
          const nextChildNode = $getNodeByKeyOrThrow(nextKey);
          const collabNode = $createCollabNodeFromLexicalNode(
            binding,
            nextChildNode,
            this,
          );
          collabNodeMap.set(nextKey, collabNode);

          if (prevHasNextKey) {
            this.splice(binding, nextIndex, 1, collabNode);
            prevIndex++;
            nextIndex++;
          } else {
            this.splice(binding, nextIndex, 0, collabNode);
            nextIndex++;
          }
        }
      }
    }

    const appendNewChildren = prevIndex > prevEndIndex;
    const removeOldChildren = nextIndex > nextEndIndex;

    if (appendNewChildren && !removeOldChildren) {
      for (; nextIndex <= nextEndIndex; ++nextIndex) {
        const key = nextChildren[nextIndex];
        const nextChildNode = $getNodeByKeyOrThrow(key);
        const collabNode = $createCollabNodeFromLexicalNode(
          binding,
          nextChildNode,
          this,
        );
        this.splice(binding, this._children.length, 0, collabNode);
        collabNodeMap.set(key, collabNode);
      }
    } else if (removeOldChildren && !appendNewChildren) {
      for (let i = this._children.length - 1; i >= nextIndex; i--) {
        this.splice(binding, i, 1);
      }
    }
  }

  splice(
    binding: Binding,
    index: number,
    delCount: number,
    collabNode?: CollabNode,
  ): void {
    const children = this._children;
    const sharedChildren = this._sharedChildren;

    sharedChildren.delete(index, delCount);

    if (collabNode) {
      sharedChildren.insert(index, [collabNode._sharedMap]);
    }

    for (const childToDelete of children.slice(index, index + delCount)) {
      childToDelete.destroy(binding);
    }

    if (collabNode !== undefined) {
      children.splice(index, delCount, collabNode);
    } else {
      children.splice(index, delCount);
    }
  }

  getChildOffset(
    collabNode:
      | CollabElementNode
      | CollabTextNode
      | CollabDecoratorNode
      | CollabLineBreakNode,
  ): number {
    return this._children.findIndex((child) => child === collabNode);
  }

  destroy(binding: Binding): void {
    for (const child of this._children) {
      child.destroy(binding);
    }

    super.destroy(binding);
  }

  // for debugging
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      children: this._children.map((child) => child.toJSON()),
    };
  }
}

export function $createCollabElementNode(
  map: null | YMap<unknown>,
  parent: null | CollabElementNode,
  type: string,
): CollabElementNode {
  return new CollabElementNode(map, parent, type);
}

export function initExistingSharedChildren(
  collabNode: CollabElementNode,
): void {
  const sharedChildren = collabNode._sharedMap.get('children') as
    | undefined
    | null
    | YArray<unknown>;
  invariant(
    sharedChildren != null,
    'Expected shared type to include children attribute',
  );
  collabNode._sharedChildren = sharedChildren;
  sharedChildren._collabNode = collabNode;
}
