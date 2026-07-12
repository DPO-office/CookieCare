const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'DraftAgreement.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Total lines:', lines.length);

// Replace lines 1814-1944 (1-indexed) = indices 1813..1943 (0-indexed, exclusive end 1944)
const startIdx = 1813;
const endIdx   = 1944;

const newLines = [
`            {/* Formatting Toolbar */}`,
`            <div className="px-4 py-1.5 border-b border-[#E5E7EB] bg-white flex items-center gap-0.5 overflow-x-auto shrink-0 select-none" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleUndo} className="p-1.5 hover:bg-[#F3F4F6] text-[#6B7280] rounded-md transition" title="Undo"><Undo className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleRedo} className="p-1.5 hover:bg-[#F3F4F6] text-[#6B7280] rounded-md transition" title="Redo"><Redo className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {`,
`                pushUndoSnapshot(editorContent);`,
`                const ed = tiptapEditorRef.current;`,
`                if (ed) { ed.chain().focus().clearContent().run(); setEditorContent(ed.getHTML()); }`,
`                else { setEditorContent("<p></p>"); }`,
`              }} className="p-1.5 hover:bg-rose-50 text-[#9CA3AF] hover:text-rose-500 rounded-md transition" title="Clear content"><Eraser className="w-3.5 h-3.5" /></button>`,
`              <span className="w-px h-4 bg-[#E5E7EB] mx-1 shrink-0" />`,
`              <select`,
`                onChange={(e) => {`,
`                  const editor = tiptapEditorRef.current;`,
`                  if (!editor) return;`,
`                  const val = e.target.value;`,
`                  if (val === "p") editor.chain().focus().setParagraph().run();`,
`                  else if (val === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();`,
`                  else if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();`,
`                  else if (val === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();`,
`                  setEditorContent(editor.getHTML());`,
`                }}`,
`                className="h-7 bg-[#F9FAFB] border border-[#E5E7EB] text-[#374151] text-xs rounded-md px-2 focus:outline-none cursor-pointer"`,
`              >`,
`                <option value="p">Paragraph</option>`,
`                <option value="h1">Heading 1</option>`,
`                <option value="h2">Heading 2</option>`,
`                <option value="h3">Heading 3</option>`,
`              </select>`,
`              <span className="w-px h-4 bg-[#E5E7EB] mx-1 shrink-0" />`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("bold")} className="p-1.5 hover:bg-[#F3F4F6] text-[#374151] rounded-md transition" title="Bold"><Bold className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const ed = tiptapEditorRef.current; if (!ed) return; ed.chain().focus().toggleItalic().run(); setEditorContent(ed.getHTML()); }} className="p-1.5 hover:bg-[#F3F4F6] text-[#374151] rounded-md transition italic" title="Italic"><span className="text-xs font-serif font-bold italic">I</span></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const ed = tiptapEditorRef.current; if (!ed) return; ed.chain().focus().toggleUnderline().run(); setEditorContent(ed.getHTML()); }} className="p-1.5 hover:bg-[#F3F4F6] text-[#374151] rounded-md transition" title="Underline"><span className="underline text-xs font-bold">U</span></button>`,
`              <span className="w-px h-4 bg-[#E5E7EB] mx-1 shrink-0" />`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("list")} className="p-1.5 hover:bg-[#F3F4F6] text-[#6B7280] rounded-md transition" title="Bullet list"><List className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const ed = tiptapEditorRef.current; if (!ed) return; ed.chain().focus().toggleOrderedList().run(); setEditorContent(ed.getHTML()); }} className="p-1.5 hover:bg-[#F3F4F6] text-[#6B7280] rounded-md transition" title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const ed = tiptapEditorRef.current; if (!ed) return; ed.chain().focus().liftListItem("listItem").run(); setEditorContent(ed.getHTML()); }} className="p-1.5 hover:bg-[#F3F4F6] text-[#9CA3AF] rounded-md transition" title="Outdent"><Outdent className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const ed = tiptapEditorRef.current; if (!ed) return; ed.chain().focus().sinkListItem("listItem").run(); setEditorContent(ed.getHTML()); }} className="p-1.5 hover:bg-[#F3F4F6] text-[#9CA3AF] rounded-md transition" title="Indent"><Indent className="w-3.5 h-3.5" /></button>`,
`              <span className="w-px h-4 bg-[#E5E7EB] mx-1 shrink-0" />`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertHtmlAtCursor("<table><tbody><tr><td>Column 1</td><td>Column 2</td></tr><tr><td></td><td></td></tr></tbody></table>")} className="p-1.5 hover:bg-[#F3F4F6] text-[#6B7280] rounded-md transition" title="Insert table"><Table className="w-3.5 h-3.5" /></button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertHtmlAtCursor("<hr />")} className="p-1.5 hover:bg-[#F3F4F6] text-[#6B7280] rounded-md transition" title="Divider"><Columns className="w-3.5 h-3.5" /></button>`,
`              <span className="w-px h-4 bg-[#E5E7EB] mx-1 shrink-0" />`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("disclaimer")} className="h-7 px-2.5 text-[11px] font-medium text-[#6B7280] hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-md transition">+ Disclaimer</button>`,
`              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarFormat("signature-block")} className="h-7 px-2.5 text-[11px] font-medium text-[#6B7280] hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-md transition">+ Sig Block</button>`,
`            </div>`,
``,
`            {/* Editor Canvas */}`,
`            <div className="flex-1 relative overflow-y-auto flex justify-center items-start" style={{ background: "#F7F8FA", padding: "3rem 2rem 5rem" }}>`,
``,
`              {/* Document paper sheet */}`,
`              <div className="w-full bg-white flex flex-col relative text-left" style={{ maxWidth: "860px", padding: "4rem 5rem", borderRadius: "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.06)", border: "1px solid #E5E7EB" }}>`,
];

const before = lines.slice(0, startIdx);
const after  = lines.slice(endIdx);

const result = [...before, ...newLines, ...after].join('\n');
fs.writeFileSync(filePath, result, 'utf8');
console.log('Done. New total lines:', result.split('\n').length);
