/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {$createTextNode, $getRoot, ParagraphNode, TextNode} from 'lexical';

import {Client, createTestConnection, waitForReact} from './utils';

describe('Collaboration', () => {
  let container: null | HTMLDivElement = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container!);
    container = null;
  });

  async function expectCorrectInitialContent(client1: Client, client2: Client) {
    // Should be empty, as client has not yet updated
    expect(client1.getHTML()).toEqual('');
    expect(client1.getHTML()).toEqual(client2.getHTML());

    // Wait for clients to render the initial content
    await Promise.resolve().then();

    expect(client1.getHTML()).toEqual('<p><br></p>');
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());
  }

  it('Should collaborate basic text insertion between two clients', async () => {
    const connector = createTestConnection();

    const client1 = connector.createClient('1');
    const client2 = connector.createClient('2');

    client1.start(container!);
    client2.start(container!);

    await expectCorrectInitialContent(client1, client2);

    // Insert a text node on client 1
    await waitForReact(() => {
      client1.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>();

        const text = $createTextNode('Hello world');

        paragraph!.append(text);
      });
    });

    expect(client1.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world</span></p>',
    );
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());

    // Insert some text on client 2
    await waitForReact(() => {
      client2.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        const text = paragraph.getFirstChild<TextNode>()!;

        text.spliceText(6, 5, 'metaverse');
      });
    });

    expect(client2.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello metaverse</span></p>',
    );
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());

    client1.stop();
    client2.stop();
  });

  it('Should collaborate basic text insertion conflicts between two clients', async () => {
    const connector = createTestConnection();

    const client1 = connector.createClient('1');
    const client2 = connector.createClient('2');

    client1.start(container!);
    client2.start(container!);

    await expectCorrectInitialContent(client1, client2);

    client1.disconnect();

    // Insert some a text node on client 1
    await waitForReact(() => {
      client1.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        const text = $createTextNode('Hello world');

        paragraph.append(text);
      });
    });
    expect(client1.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world</span></p>',
    );
    expect(client2.getHTML()).toEqual('<p><br></p>');

    // Insert some a text node on client 1
    await waitForReact(() => {
      client2.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        const text = $createTextNode('Hello world');

        paragraph.append(text);
      });
    });

    expect(client2.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world</span></p>',
    );
    expect(client1.getHTML()).toEqual(client2.getHTML());

    await waitForReact(() => {
      client1.connect();
    });

    // Text content should be repeated, but there should only be a single node
    expect(client1.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello worldHello world</span></p>',
    );
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());

    client2.disconnect();

    await waitForReact(() => {
      client1.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        const text = paragraph.getFirstChild<TextNode>()!;

        text.spliceText(11, 11, '');
      });
    });

    expect(client1.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world</span></p>',
    );
    expect(client2.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello worldHello world</span></p>',
    );

    await waitForReact(() => {
      client2.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        const text = paragraph.getFirstChild<TextNode>()!;

        text.spliceText(11, 11, '!');
      });
    });

    await waitForReact(() => {
      client2.connect();
    });

    expect(client1.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world!</span></p>',
    );
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());

    client1.stop();
    client2.stop();
  });

  it('Should collaborate basic text deletion conflicts between two clients', async () => {
    const connector = createTestConnection();

    // First client is started before second client is initialized.
    // It guarantees that createBinding won't set any children of top level yjs data
    // when create binding (called by client.start). Otherwise, the new doc (created when
    // createClient is called) won't be connected with it successfully.
    const client1 = connector.createClient('1');
    client1.start(container!);
    const client2 = connector.createClient('2');
    client2.start(container!);

    await expectCorrectInitialContent(client1, client2);

    // Insert some a text node on client 1
    await waitForReact(() => {
      client1.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        const text = $createTextNode('Hello world');
        paragraph.append(text);
      });
    });

    expect(client1.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world</span></p>',
    );
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());

    client1.disconnect();

    // Delete the text on client 1
    await waitForReact(() => {
      client1.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;
        paragraph.getFirstChild()!.remove();
      });
    });

    expect(client1.getHTML()).toEqual('<p><br></p>');
    expect(client2.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello world</span></p>',
    );

    // Insert some text on client 2
    await waitForReact(() => {
      client2.update(() => {
        const root = $getRoot();

        const paragraph = root.getFirstChild<ParagraphNode>()!;

        paragraph.getFirstChild<TextNode>()!.spliceText(11, 0, 'Hello world');
      });
    });

    expect(client1.getHTML()).toEqual('<p><br></p>');
    expect(client2.getHTML()).toEqual(
      '<p dir="ltr"><span data-lexical-text="true">Hello worldHello world</span></p>',
    );

    await waitForReact(() => {
      client1.connect();
    });

    expect(client1.getHTML()).toEqual('<p><br></p>');
    expect(client1.getHTML()).toEqual(client2.getHTML());
    expect(client1.getDocJSON()['root.children'].length).toEqual(1);
    expect(client1.getDocJSON()['root.children'][0].type).toEqual('paragraph');
    expect(client1.getDocJSON()).toEqual(client2.getDocJSON());
    client1.stop();
    client2.stop();
  });

  it('Should allow the passing of arbitrary awareness data', async () => {
    const connector = createTestConnection();

    const client1 = connector.createClient('1');
    const client2 = connector.createClient('2');

    const awarenessData1 = {
      foo: 'foo',
      uuid: Math.floor(Math.random() * 10000),
    };
    const awarenessData2 = {
      bar: 'bar',
      uuid: Math.floor(Math.random() * 10000),
    };

    client1.start(container!, awarenessData1);
    client2.start(container!, awarenessData2);

    await expectCorrectInitialContent(client1, client2);

    expect(client1.awareness.getLocalState()!.awarenessData).toEqual(
      awarenessData1,
    );
    expect(client2.awareness.getLocalState()!.awarenessData).toEqual(
      awarenessData2,
    );

    client1.stop();
    client2.stop();
  });
});
