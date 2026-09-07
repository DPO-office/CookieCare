import fs from "fs";
fs.writeFileSync(
  "logs/analysis/eval/_dpa_exists.json",
  JSON.stringify(
    {
      dpa: fs.existsSync("C:/Users/abhinav.yadav_randst/Downloads/DPA - 1.docx"),
      dpaCopy: fs.existsSync(
        "C:/Users/abhinav.yadav_randst/Downloads/DPA - 1 (1).docx"
      ),
    },
    null,
    2
  )
);
