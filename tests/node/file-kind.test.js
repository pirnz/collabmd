import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getVaultFileKind,
  getVaultTreeNodeType,
  isHtmlFilePath,
  isRecognizedVaultFilePath,
  isVaultFilePath,
  supportsDownloadForFilePath,
  supportsPreviewForFilePath,
  stripVaultFileExtension,
} from '../../src/domain/file-kind.js';

test('HTML files are supported vault files', () => {
  assert.equal(getVaultFileKind('reports/index.html'), 'html');
  assert.equal(getVaultFileKind('reports/legacy.HTM'), 'html');
  assert.equal(isHtmlFilePath('reports/index.html'), true);
  assert.equal(isVaultFilePath('reports/index.html'), true);
  assert.equal(stripVaultFileExtension('index.html'), 'index');
});

test('unknown file extensions return null kind', () => {
  assert.equal(getVaultFileKind('book.epub'), null);
  assert.equal(getVaultFileKind('archive.zip'), null);
  assert.equal(getVaultFileKind('document.docx'), null);
  assert.equal(getVaultFileKind('data.txt'), null);
  assert.equal(getVaultFileKind('file.xyz'), null);
});

test('unknown files have unknown tree node type', () => {
  assert.equal(getVaultTreeNodeType('book.epub'), 'unknown');
  assert.equal(getVaultTreeNodeType('archive.zip'), 'unknown');
  assert.equal(getVaultTreeNodeType('document.docx'), 'unknown');
  assert.equal(getVaultTreeNodeType('data.txt'), 'unknown');
  assert.equal(getVaultTreeNodeType('FILE.XYZ'), 'unknown');
});

test('isVaultFilePath still recognizes known formats', () => {
  assert.equal(isVaultFilePath('notes.md'), true);
  assert.equal(isVaultFilePath('diagram.puml'), true);
  assert.equal(isVaultFilePath('image.png'), true);
});

test('isRecognizedVaultFilePath distinguishes known from unknown', () => {
  assert.equal(isRecognizedVaultFilePath('notes.md'), true);
  assert.equal(isRecognizedVaultFilePath('book.epub'), false);
  assert.equal(isRecognizedVaultFilePath('archive.zip'), false);
});

test('unknown files do not support preview', () => {
  assert.equal(supportsPreviewForFilePath('book.epub'), false);
  assert.equal(supportsPreviewForFilePath('archive.zip'), false);
  assert.equal(supportsPreviewForFilePath('notes.md'), true);
});

test('all files support download', () => {
  assert.equal(supportsDownloadForFilePath('book.epub'), true);
  assert.equal(supportsDownloadForFilePath('archive.zip'), true);
  assert.equal(supportsDownloadForFilePath('notes.md'), true);
  assert.equal(supportsDownloadForFilePath('image.png'), true);
});
