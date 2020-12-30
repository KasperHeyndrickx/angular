/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {AbsoluteFsPath, getFileSystem, PathManipulation} from '@angular/compiler-cli/src/ngtsc/file_system';
import {ɵParsedMessage, ɵSourceLocation} from '@angular/localize';

import {extractIcuPlaceholders} from './icu_parsing';
import {TranslationSerializer} from './translation_serializer';
import {XmlFile} from './xml_file';

/**
 * A translation serializer that can write files in XMB format.
 *
 * http://cldr.unicode.org/development/development-process/design-proposals/xmb
 *
 * @see XmbTranslationParser
 * @publicApi used by CLI
 */
export class XmbTranslationSerializer implements TranslationSerializer {
  constructor(
      private basePath: AbsoluteFsPath, private useLegacyIds: boolean,
      private fs: PathManipulation = getFileSystem()) {}

  serialize(messages: ɵParsedMessage[]): string {
    const ids = new Set<string>();
    const xml = new XmlFile();
    xml.rawText(
        `<!DOCTYPE messagebundle [\n` +
        `<!ELEMENT messagebundle (msg)*>\n` +
        `<!ATTLIST messagebundle class CDATA #IMPLIED>\n` +
        `\n` +
        `<!ELEMENT msg (#PCDATA|ph|source)*>\n` +
        `<!ATTLIST msg id CDATA #IMPLIED>\n` +
        `<!ATTLIST msg seq CDATA #IMPLIED>\n` +
        `<!ATTLIST msg name CDATA #IMPLIED>\n` +
        `<!ATTLIST msg desc CDATA #IMPLIED>\n` +
        `<!ATTLIST msg meaning CDATA #IMPLIED>\n` +
        `<!ATTLIST msg obsolete (obsolete) #IMPLIED>\n` +
        `<!ATTLIST msg xml:space (default|preserve) "default">\n` +
        `<!ATTLIST msg is_hidden CDATA #IMPLIED>\n` +
        `\n` +
        `<!ELEMENT source (#PCDATA)>\n` +
        `\n` +
        `<!ELEMENT ph (#PCDATA|ex)*>\n` +
        `<!ATTLIST ph name CDATA #REQUIRED>\n` +
        `\n` +
        `<!ELEMENT ex (#PCDATA)>\n` +
        `]>\n`);
    xml.startTag('messagebundle');
    for (const message of messages) {
      const id = this.getMessageId(message);
      if (ids.has(id)) {
        // Do not render the same message more than once
        continue;
      }
      ids.add(id);
      xml.startTag(
          'msg', {id, desc: message.description, meaning: message.meaning},
          {preserveWhitespace: true});
      if (message.location) {
        this.serializeLocation(xml, message.location);
      }
      this.serializeMessage(xml, message);
      xml.endTag('msg', {preserveWhitespace: false});
    }
    xml.endTag('messagebundle');
    return xml.toString();
  }

  private serializeLocation(xml: XmlFile, location: ɵSourceLocation): void {
    xml.startTag('source');
    const endLineString = location.end !== undefined && location.end.line !== location.start.line ?
        `,${location.end.line + 1}` :
        '';
    xml.text(
        `${this.fs.relative(this.basePath, location.file)}:${location.start.line}${endLineString}`);
    xml.endTag('source');
  }

  private serializeMessage(xml: XmlFile, message: ɵParsedMessage): void {
    const length = message.messageParts.length - 1;
    for (let i = 0; i < length; i++) {
      this.serializeTextPart(xml, message.messageParts[i]);
      xml.startTag('ph', {name: message.placeholderNames[i]}, {selfClosing: true});
    }
    this.serializeTextPart(xml, message.messageParts[length]);
  }

  private serializeTextPart(xml: XmlFile, text: string): void {
    const pieces = extractIcuPlaceholders(text);
    const length = pieces.length - 1;
    for (let i = 0; i < length; i += 2) {
      xml.text(pieces[i]);
      xml.startTag('ph', {name: pieces[i + 1]}, {selfClosing: true});
    }
    xml.text(pieces[length]);
  }

  /**
   * Get the id for the given `message`.
   *
   * If there was a custom id provided, use that.
   *
   * If we have requested legacy message ids, then try to return the appropriate id
   * from the list of legacy ids that were extracted.
   *
   * Otherwise return the canonical message id.
   *
   * An XMB legacy message id is a 64 bit number encoded as a decimal string, which will have
   * at most 20 digits, since 2^65-1 = 36,893,488,147,419,103,231. This digest is based on:
   * https://github.com/google/closure-compiler/blob/master/src/com/google/javascript/jscomp/GoogleJsMessageIdGenerator.java
   */
  private getMessageId(message: ɵParsedMessage): string {
    return message.customId ||
        this.useLegacyIds && message.legacyIds !== undefined &&
        message.legacyIds.find(id => id.length <= 20 && !/[^0-9]/.test(id)) ||
        message.id;
  }
}
