/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {CollabElementNode} from './CollabElementNode';
import type {NodeKey, NodeMap, TextNode} from 'lexical';

import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import invariant from 'shared/invariant';
import simpleDiffWithCursor from 'shared/simpleDiffWithCursor';
import {Map as YMap, Text as YText} from 'yjs';

import {CollabNode} from './CollabNode';

function $diffTextContentAndApplyDelta(
  collabNode: CollabTextNode,
  key: NodeKey,
  prevText: string,
  nextText: string,
): void {
  const selection = $getSelection();
  let cursorOffset = nextText.length;

  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const anchor = selection.anchor;

    if (anchor.key === key) {
      cursorOffset = anchor.offset;
    }
  }

  // XXX: What if there exists multiple diff? Is this implementation robust enough?
  // XXX: maybe use fast-diff?
  const diff = simpleDiffWithCursor(prevText, nextText, cursorOffset);
  collabNode._text.delete(diff.index, diff.remove);
  collabNode._text.insert(diff.index, diff.insert);
}

export class CollabTextNode extends CollabNode {
  _text!: YText;
  _normalized: boolean;

  constructor(
    sharedMap: null | YMap<unknown>,
    parent: null | CollabElementNode,
    type: string,
  ) {
    super(sharedMap, parent, type, 'text');
    this._key = '';

    if (sharedMap === null) {
      this._text = new YText();
      this._sharedMap.set('text', this._text);
      this._text._collabNode = this;
    } else {
      initExistingSharedText(this);
    }

    this._normalized = false;
  }

  getPrevNode(nodeMap: null | NodeMap): null | TextNode {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isTextNode(node) ? node : null;
  }

  getNode(): null | TextNode {
    const node = $getNodeByKey(this._key);
    return $isTextNode(node) ? node : null;
  }

  getCursorYjsType(): YText {
    return this._text;
  }

  getOffset(): number {
    return this.getParent().getChildOffset(this);
  }

  syncTextFromLexical(
    nextLexicalNode: TextNode,
    prevNodeMap: null | NodeMap,
  ): void {
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const nextText = nextLexicalNode.__text;

    if (prevLexicalNode !== null) {
      const prevText = prevLexicalNode.__text;

      if (prevText !== nextText) {
        const key = nextLexicalNode.__key;
        $diffTextContentAndApplyDelta(this, key, prevText, nextText);
      }
    } else {
      this._text.insert(0, nextText);
    }
  }

  syncTextFromYjs(): void {
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncTextFromYjs: could not find decorator node',
    );
    const collabText = this._text.toJSON();

    if (lexicalNode.__text !== collabText) {
      const writable = lexicalNode.getWritable();
      writable.__text = collabText;
    }
  }

  // for debugging
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      text: this._text.toJSON(),
    };
  }
}

export function $createCollabTextNode(
  sharedMap: null | YMap<unknown>,
  parent: CollabElementNode,
  type: string,
): CollabTextNode {
  return new CollabTextNode(sharedMap, parent, type);
}

export function initExistingSharedText(collabNode: CollabTextNode): void {
  const text = collabNode._sharedMap.get('text') as undefined | null | YText;
  invariant(text != null, 'Expected shared type to include text attribute');
  collabNode._text = text;
  text._collabNode = collabNode;
}
