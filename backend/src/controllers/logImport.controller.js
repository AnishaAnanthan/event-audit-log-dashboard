import { importCollectedLogFiles, importUploadedLogFile } from "../services/logFileImport.service.js";

export const importFromCollectedLogFolder = async (req, res, next) => {
  try {
    const clearExistingImported = req.query?.replace === "true" || req.body?.replace === true;
    const result = await importCollectedLogFiles({ clearExistingImported });
    return res.status(200).json({
      message: "Log files imported successfully",
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

export const importFromUploadedLogFile = async (req, res, next) => {
  try {
    const { fileName, content, replacePreviousUploads = false } = req.body || {};
    const result = await importUploadedLogFile({
      fileName,
      content,
      replacePreviousUploads: replacePreviousUploads === true,
    });

    return res.status(200).json({
      message: "Uploaded log file imported successfully",
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};
