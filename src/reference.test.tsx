import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Reference, { REFERENCE_SNIPPETS } from './Reference';

describe('Help developer reference', () => {
  it('documents the stable schema and identifier formats', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('qortium.help.feedback.v1');
    expect(html).toContain('qhelp.feedback.v1.p.');
    expect(html).toContain('qhelp.feedback.v1.c.');
    expect(html).toContain('64 UTF-8 bytes');
    expect(html).toContain('Orphan replies');
  });

  it('documents metadata limits and name-based ownership', () => {
    const html = renderToStaticMarkup(<Reference />);

    expect(html).toContain('80');
    expect(html).toContain('240');
    expect(html).toContain('5');
    expect(html).toContain('QDN ownership is name-based');
    expect(html).toContain('Tagged app owners do not own reporter posts.');
  });

  it('provides bridge examples for every feedback resource operation', () => {
    expect(REFERENCE_SNIPPETS.featureDetection).toContain("action: 'SHOW_ACTIONS'");
    expect(REFERENCE_SNIPPETS.featureDetection).toContain("action: 'GET_HOST_INFO'");
    expect(REFERENCE_SNIPPETS.publish).toContain("action: 'PUBLISH_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.search).toContain("action: 'SEARCH_QDN_RESOURCES'");
    expect(REFERENCE_SNIPPETS.fetch).toContain("action: 'FETCH_QDN_RESOURCE'");
    expect(REFERENCE_SNIPPETS.delete).toContain("action: 'DELETE_QDN_RESOURCE'");
  });

  it('keeps the publish example aligned with the Help v1 resource contract', () => {
    expect(REFERENCE_SNIPPETS.publish).toContain("service: 'JSON'");
    expect(REFERENCE_SNIPPETS.publish).toContain("filename: 'feedback.json'");
    expect(REFERENCE_SNIPPETS.publish).toContain('qhelp.feedback.v1.p.');
    expect(REFERENCE_SNIPPETS.publish).toContain("['qortium-help', 'feedback', 'v1', 'post', payload.type]");
  });
});
