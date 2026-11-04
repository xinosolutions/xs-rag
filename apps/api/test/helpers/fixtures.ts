// CRC32 table
const table = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  table[i] = c;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]!) & 0xff]!;
  }
  return (~crc) >>> 0;
}

export function createZipBuffer(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf-8');
    const nameBuf = Buffer.from(f.name, 'utf-8');
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression = 0 (store)
    localHeader.writeUInt16LE(0, 10); // time
    localHeader.writeUInt16LE(0, 12); // date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field len
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method = 0
    central.writeUInt16LE(0, 12); // time
    central.writeUInt16LE(0, 14); // date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // int attr
    central.writeUInt32LE(0, 38); // ext attr
    central.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += localHeader.length + data.length;
  }

  const centralData = Buffer.concat(centralHeaders);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralData, end]);
}

export function createValidDocxBuffer(): Buffer {
  return createZipBuffer([
    {
      name: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DOCX Section One</w:t></w:r></w:p><w:p><w:r><w:t>This is the first paragraph under heading one in the docx file.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>DOCX Section Two</w:t></w:r></w:p><w:p><w:r><w:t>This is the second paragraph under heading two in the docx file.</w:t></w:r></w:p></w:body></w:document>',
    },
  ]);
}

export function createValidTwoPagePdfBuffer(): Buffer {
  const stream1 = 'BT\n/F1 18 Tf\n50 700 Td\n(Page One Policy) Tj\n/F1 12 Tf\n0 -30 Td\n(This is the body paragraph for page one under the heading.) Tj\nET';
  const stream2 = 'BT\n/F1 18 Tf\n50 700 Td\n(Page Two Guidelines) Tj\n/F1 12 Tf\n0 -30 Td\n(This is the body paragraph for page two under the heading.) Tj\nET';

  const bodyParts = [
    '%PDF-1.4\n',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >> endobj\n',
    '4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >> endobj\n',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    `6 0 obj << /Length ${stream1.length} >> stream\n${stream1}\nendstream endobj\n`,
    `7 0 obj << /Length ${stream2.length} >> stream\n${stream2}\nendstream endobj\n`,
  ];

  let offset = 0;
  const offsets: number[] = [0]; // obj 0 is dummy

  for (let i = 1; i <= 7; i++) {
    offsets.push(offset + bodyParts.slice(0, i).join('').length);
  }

  const fullBody = bodyParts.join('');
  const xrefOffset = fullBody.length;

  let xref = `xref\n0 8\n0000000000 65535 f \n`;
  for (let i = 1; i <= 7; i++) {
    const offStr = String(offsets[i]!).padStart(10, '0');
    xref += `${offStr} 00000 n \n`;
  }

  const trailer = `trailer << /Size 8 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(fullBody + xref + trailer, 'latin1');
}

export function createTruncatedPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >>\n%%EOF_CORRUPT_TRUNCATED');
}
