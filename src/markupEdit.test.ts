import { describe, expect, it } from 'vitest';
import { continueList, insertBlock, prefixLines, replaceSelection, wrapSelection } from './markupEdit';

describe('prefixLines', () => {
  it('prefixes the caret line', () => {
    expect(prefixLines({ value: 'a\nbc\nd', start: 3, end: 3 }, '# ')).toEqual({ value: 'a\n# bc\nd', start: 5, end: 5 });
  });

  it('prefixes every selected line', () => {
    expect(prefixLines({ value: 'a\nb\nc', start: 1, end: 3 }, '#* ')).toEqual({
      value: '#* a\n#* b\nc',
      start: 4,
      end: 9,
    });
  });
});

describe('wrapSelection', () => {
  it('wraps the selection', () => {
    expect(wrapSelection({ value: 'a bc d', start: 2, end: 4 }, '*', '*')).toEqual({ value: 'a *bc* d', start: 3, end: 5 });
  });

  it('puts the caret between markers when nothing is selected', () => {
    expect(wrapSelection({ value: 'ab', start: 1, end: 1 }, '{code}\n', '\n{code}')).toEqual({
      value: 'a{code}\n\n{code}b',
      start: 8,
      end: 8,
    });
  });
});

describe('replaceSelection', () => {
  it('replaces the selection and moves the caret after the text', () => {
    expect(replaceSelection({ value: 'a XX b', start: 2, end: 4 }, '!image-1.png!')).toEqual({
      value: 'a !image-1.png! b',
      start: 15,
      end: 15,
    });
  });
});

describe('continueList', () => {
  it('starts the next item with the same marker', () => {
    expect(continueList({ value: '# step 1', start: 8, end: 8 })).toEqual({ value: '# step 1\n# ', start: 11, end: 11 });
    expect(continueList({ value: 'a\n#* x\nb', start: 6, end: 6 })).toEqual({ value: 'a\n#* x\n#* \nb', start: 10, end: 10 });
    expect(continueList({ value: '- x', start: 3, end: 3 })).toEqual({ value: '- x\n- ', start: 6, end: 6 });
  });

  it('splits an item when the caret is inside its text', () => {
    expect(continueList({ value: '* ab', start: 3, end: 3 })).toEqual({ value: '* a\n* b', start: 6, end: 6 });
  });

  it('ends the list on an empty item and moves a nested empty item up a level', () => {
    expect(continueList({ value: '# a\n# ', start: 6, end: 6 })).toEqual({ value: '# a\n', start: 4, end: 4 });
    expect(continueList({ value: '# a\n#* ', start: 7, end: 7 })).toEqual({ value: '# a\n# ', start: 6, end: 6 });
  });

  it('leaves Enter alone outside list items, before the marker and with a selection', () => {
    expect(continueList({ value: 'plain', start: 5, end: 5 })).toBeNull();
    expect(continueList({ value: '*bold* text', start: 11, end: 11 })).toBeNull();
    expect(continueList({ value: '# a', start: 0, end: 0 })).toBeNull();
    expect(continueList({ value: '# abc', start: 2, end: 4 })).toBeNull();
  });
});

describe('insertBlock', () => {
  it('puts the block on its own lines', () => {
    expect(insertBlock({ value: 'ab', start: 1, end: 1 }, 'X')).toEqual({ value: 'a\nX\nb', start: 4, end: 4 });
  });

  it('adds no extra newlines at line boundaries', () => {
    expect(insertBlock({ value: 'a\n', start: 2, end: 2 }, 'X')).toEqual({ value: 'a\nX', start: 3, end: 3 });
  });
});
