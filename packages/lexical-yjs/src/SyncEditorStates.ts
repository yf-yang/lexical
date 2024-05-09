/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {EditorState, NodeKey} from 'lexical';

import {$createOffsetView} from '@lexical/offset';
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
} from 'lexical';
import invariant from 'shared/invariant';
import {Text as YText, YArrayEvent,YEvent, YMapEvent, YTextEvent} from 'yjs';

import {Binding, Provider} from '.';
import {CollabElementNode} from './CollabElementNode';
import {CollabTextNode} from './CollabTextNode';
import {
  syncCursorPositions,
  syncLexicalSelectionToYjs,
  syncLocalCursorPosition,
} from './SyncCursors';
import {
  doesSelectionNeedRecovering,
  getOrInitCollabNodeFromSharedMap,
  syncPropertiesFromLexical,
  syncWithTransaction,
  updateNodeFromYjs,
} from './Utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncEvent(binding: Binding, event: any): void {
  const {target} = event;

  // Each sharedMap will not change. A sharedMap has the following keys:
  // - category: string, static
  // - type: string, static
  // - props: YMap<unknown>, dynamic
  // - children: YArray<unknown>, dynamic, only for CollabElementNode's sharedMap
  // - text: YText, dynamic, only for CollabTextNode's sharedMap
  // For those dynamic yjs types, each one should already has a property _collabNode that points
  // to the corresponding CollabNode instance.
  const collabNode = getOrInitCollabNodeFromSharedMap(binding, target);

  if (event instanceof YMapEvent) {
    // props changes

    // Update
    if (event.changes.keys.size > 0) {
      updateNodeFromYjs(collabNode);
    }
  } else if (
    event instanceof YTextEvent &&
    collabNode instanceof CollabTextNode
  ) {
    // text changes

    collabNode.syncTextFromYjs();
  } else if (
    event instanceof YArrayEvent &&
    collabNode instanceof CollabElementNode
  ) {
    // children changes
    collabNode.applyChildrenYjsDelta(binding, event.delta);
    collabNode.syncChildrenFromYjs(binding);
  } else {
    invariant(false, 'Expected text, element, or decorator event');
  }
}

export function syncYjsChangesToLexical(
  binding: Binding,
  provider: Provider,
  events: Array<YEvent<YText>>,
  isFromUndoManger: boolean,
): void {
  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  // This line precompute the delta before editor update. The reason is
  // delta is computed when it is accessed. Note that this can only be
  // safely computed during the event call. If it is accessed after event
  // call it might result in unexpected behavior.
  // https://github.com/yjs/yjs/blob/00ef472d68545cb260abd35c2de4b3b78719c9e4/src/utils/YEvent.js#L132
  events.forEach((event) => event.delta);

  editor.update(
    () => {
      const pendingEditorState: EditorState | null = editor._pendingEditorState;

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        syncEvent(binding, event);
      }

      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        // We can't use Yjs's cursor position here, as it doesn't always
        // handle selection recovery correctly – especially on elements that
        // get moved around or split. So instead, we roll our own solution.
        if (doesSelectionNeedRecovering(selection)) {
          const prevSelection = currentEditorState._selection;

          if ($isRangeSelection(prevSelection)) {
            const prevOffsetView = $createOffsetView(
              editor,
              0,
              currentEditorState,
            );
            const nextOffsetView = $createOffsetView(
              editor,
              0,
              pendingEditorState,
            );
            const [start, end] =
              prevOffsetView.getOffsetsFromSelection(prevSelection);
            const nextSelection =
              start >= 0 && end >= 0
                ? nextOffsetView.createSelectionFromOffsets(
                    start,
                    end,
                    prevOffsetView,
                  )
                : null;

            if (nextSelection !== null) {
              $setSelection(nextSelection);
            } else {
              // Fallback is to use the Yjs cursor position
              syncLocalCursorPosition(binding, provider);

              if (doesSelectionNeedRecovering(selection)) {
                // Fallback
                $getRoot().selectEnd();
              }
            }
          }

          syncLexicalSelectionToYjs(
            binding,
            provider,
            prevSelection,
            $getSelection(),
          );
        } else {
          syncLocalCursorPosition(binding, provider);
        }
      }
    },
    {
      onUpdate: () => {
        syncCursorPositions(binding, provider);
      },
      skipTransforms: true,
      tag: isFromUndoManger ? 'historic' : 'collaboration',
    },
  );
}

function $handleNormalizationMergeConflicts(
  binding: Binding,
  normalizedNodes: Set<NodeKey>,
): void {
  // We handle the merge operations here
  const normalizedNodesKeys = Array.from(normalizedNodes);
  const collabNodeMap = binding.collabNodeMap;
  const mergedNodes = [];

  for (let i = 0; i < normalizedNodesKeys.length; i++) {
    const nodeKey = normalizedNodesKeys[i];
    const lexicalNode = $getNodeByKey(nodeKey);
    const collabNode = collabNodeMap.get(nodeKey);

    if (collabNode instanceof CollabTextNode) {
      if ($isTextNode(lexicalNode)) {
        // We mutate the text collab nodes after removing
        // all the dead nodes first, otherwise offsets break.
        mergedNodes.push([collabNode, lexicalNode.__text]);
      } else {
        const offset = collabNode.getOffset();

        if (offset === -1) {
          continue;
        }

        const parent = collabNode.getParent();

        parent._sharedChildren.delete(offset, 1);

        collabNodeMap.delete(nodeKey);
        const parentChildren = parent!._children;
        const index = parentChildren.indexOf(collabNode);
        parentChildren.splice(index, 1);
      }
    }
  }

  for (let i = 0; i < mergedNodes.length; i++) {
    const [collabNode, text] = mergedNodes[i];
    if (collabNode instanceof CollabTextNode && typeof text === 'string') {
      const yText = collabNode._text;
      yText.delete(0, yText.length);
      yText.insert(0, text);
    }
  }
}

type IntentionallyMarkedAsDirtyElement = boolean;

export function syncLexicalUpdateToYjs(
  binding: Binding,
  provider: Provider,
  prevEditorState: EditorState,
  currEditorState: EditorState,
  dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
  dirtyLeaves: Set<NodeKey>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>,
): void {
  syncWithTransaction(binding, () => {
    currEditorState.read(() => {
      // We check if the update has come from a origin where the origin
      // was the collaboration binding previously. This can help us
      // prevent unnecessarily re-diffing and possible re-applying
      // the same change editor state again. For example, if a user
      // types a character and we get it, we don't want to then insert
      // the same character again. The exception to this heuristic is
      // when we need to handle normalization merge conflicts.
      if (tags.has('collaboration') || tags.has('historic')) {
        if (normalizedNodes.size > 0) {
          $handleNormalizationMergeConflicts(binding, normalizedNodes);
        }

        return;
      }

      if (dirtyElements.has('root')) {
        const prevNodeMap = prevEditorState._nodeMap;
        const nextLexicalRoot = $getRoot();
        const collabRoot = binding.root;
        // avoid calling exportJSON and compare props if the element itself is not dirty
        if (dirtyElements.get('root')) {
          syncPropertiesFromLexical(collabRoot, nextLexicalRoot);
        }
        collabRoot.syncChildrenFromLexical(
          binding,
          nextLexicalRoot,
          prevNodeMap,
          dirtyElements,
          dirtyLeaves,
        );
      }

      const selection = $getSelection();
      const prevSelection = prevEditorState._selection;
      syncLexicalSelectionToYjs(binding, provider, prevSelection, selection);
    });
  });
}
