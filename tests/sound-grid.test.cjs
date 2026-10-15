const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

function render() {
    const elements = [];
    function element(tag) {
        const node = {
            tag, children: [], attributes: {}, listeners: {}, disabled: false,
            appendChild(child) { this.children.push(child); },
            setAttribute(key, value) { this.attributes[key] = value; },
            getAttribute(key) { return this.attributes[key]; },
            addEventListener(event, callback) { this.listeners[event] = callback; }
        };
        elements.push(node);
        return node;
    }
    const containers = Object.fromEntries(
        ['notification-sounds', 'beep-sounds', 'join-leave-sounds'].map(id => [id, element('div')])
    );
    let initialize;
    const document = {
        createElement: element,
        getElementById: id => containers[id],
        addEventListener(event, callback) {
            assert.equal(event, 'DOMContentLoaded');
            initialize = callback;
        },
        querySelectorAll(selector) {
            assert.ok(['.play-button', '.play-button:not(:disabled)'].includes(selector));
            return elements.filter(node => node.className === 'play-button' &&
                (selector === '.play-button' || !node.disabled));
        }
    };
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const context = { document };
    runInNewContext(script, context);
    const played = [];
    context.playSound = file => played.push(file);
    initialize();
    return { cards: Object.values(containers).flatMap(node => node.children), played };
}

// These are the six recordings supplied with the sound board.
const available = ['bell', 'chime', 'email', 'join', 'message', 'ping'].map(name => `sounds/${name}.wav`);

test('unavailable sounds remain visible without working-looking actions', () => {
    const { cards } = render();
    assert.equal(cards.length, 24);
    const missing = cards.filter(card => !available.includes(card.children[0].attributes['data-sound']));
    assert.equal(missing.length, 18);
    for (const card of missing) {
        const button = card.children[0];
        assert.equal(button.disabled, true, button.textContent);
        assert.equal(button.listeners.click, undefined, button.textContent);
        assert.equal(card.children.some(child => child.tag === 'a'), false);
        assert.match(card.children[1].textContent, /Unavailable: audio file not supplied/);
    }
});

test('supplied recordings retain Play and Download actions', () => {
    const { cards, played } = render();
    const ready = cards.filter(card => available.includes(card.children[0].attributes['data-sound']));
    assert.equal(ready.length, 6);
    for (const card of ready) {
        const [button, link] = card.children;
        assert.equal(button.disabled, false);
        assert.equal(link.tag, 'a');
        assert.equal(link.href, button.attributes['data-sound']);
        assert.equal(link.attributes.download, '');
        button.listeners.click.call(button);
    }
    assert.deepEqual(played.sort(), available.sort());
});
