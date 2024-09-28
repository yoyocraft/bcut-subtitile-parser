/**
 * Reads a file and returns its content as a string.
 * @param {File} file - The file to be read.
 * @returns {Promise<string>} - A promise that resolves with the file content.
 */
const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject('File reading failed');
    reader.readAsText(file);
});

/**
 * Extracts subtitle information from a parsed BCut JSON data structure.
 * @param {Object} data - Parsed JSON data from BCut.
 * @returns {Array<{inPoint: number, outPoint: number, content: string}>} - Array of subtitle objects.
 */
const extractSubtitlesFromBcutJson = (data) =>
    data.tracks.flatMap(track =>
        track.clips
            .filter(clip => clip.AssetInfo.itemName === 'SubttCaption')
            .map(clip => ({
                inPoint: clip.inPoint,
                outPoint: clip.outPoint,
                content: clip.AssetInfo.content,
            }))
    );

/**
 * Converts milliseconds to SRT timestamp format.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} - Timestamp in 'HH:MM:SS,ms' format.
 */
const msToSrtTime = (ms) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

/**
 * Converts milliseconds to ASS timestamp format.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} - Timestamp in 'HH:MM:SS.cs' format.
 */
const msToAssTime = (ms) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

/**
 * Generates subtitle files in different formats.
 * @param {Array<{inPoint: number, outPoint: number, content: string}>} subtitles - Array of subtitle objects.
 * @returns {Object} - Functions to generate SRT, ASS, TXT, and CSV.
 */
const generateSubtitleFiles = (subtitles) => {
    const srt = subtitles.map(({ content, inPoint, outPoint }, i) =>
        `${i + 1}\r\n${msToSrtTime(inPoint)} --> ${msToSrtTime(outPoint)}\r\n${content}\r\n\r\n`
    ).join('');

    const ass = `[Script Info]\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\n` +
        subtitles.map(({ content, inPoint, outPoint }) =>
            `Dialogue: 0,${msToAssTime(inPoint)},${msToAssTime(outPoint)},Default,,0,0,0,,${content}\r\n`
        ).join('');

    const txt = subtitles.map(({ content }) => `${content}\r\n`).join('');

    const csv = `\ufeffStart,End,Text\n` + subtitles.map(({ content, inPoint, outPoint }) =>
        `${msToAssTime(inPoint)},${msToAssTime(outPoint)},"${content.replace(/"/g, '""')}"\n`
    ).join('');

    return { srt, ass, txt, csv };
};

/**
 * Populates a table with subtitle data.
 * @param {Array<{inPoint: number, outPoint: number, content: string}>} subtitles - Array of subtitle objects.
 * @param {HTMLTableSectionElement} tbody - The table body element.
 */
const populateTable = (subtitles, tbody) => {
    tbody.innerHTML = ''; // Clear table first
    subtitles.forEach(({ content, inPoint, outPoint }, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${i + 1}</td>
            <td>${msToAssTime(inPoint)}</td>
            <td>${msToAssTime(outPoint)}</td>
            <td>${content}</td>`;
        tbody.appendChild(row);
    });
};

/**
 * Generates a timestamp string in 'YYYYMMDD_HHMMSS' format.
 * @returns {string} - The formatted timestamp.
 */
const generateTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
};

/**
 * Generates an export file name based on the original file name and current timestamp.
 * @param {string} originalFileName - The original file name.
 * @param {string} extension - The file extension (e.g., '.srt', '.ass').
 * @returns {string} - A meaningful file name.
 */
const generateExportFileName = (originalFileName, extension) => {
    const baseName = originalFileName.replace(/\.[^/.]+$/, ""); // Remove the file extension
    const timestamp = generateTimestamp();
    return `${baseName}_${timestamp}${extension}`;
};
/**
 * Caches file blobs and object URLs to optimize performance.
 * @param {Blob} blob 
 * @param {string} filename 
 */
const cache = {
    blobs: new Map(),
    urls: new Map()
};

/**
 * Generates a URL for the given blob if not already cached.
 * @param {Blob} blob - The content blob.
 * @param {string} filename - The filename to download as.
 * @returns {string} - The object URL for the blob.
 */
const getCachedUrl = (blob, filename) => {
    if (!cache.urls.has(filename)) {
        const url = URL.createObjectURL(blob);
        cache.urls.set(filename, url);
    }
    return cache.urls.get(filename);
};

/**
 * Cleans up cached URL and blob.
 * @param {string} filename - The filename to clean up from cache.
 */
const cleanupCache = (filename) => {
    if (cache.urls.has(filename)) {
        URL.revokeObjectURL(cache.urls.get(filename));
        cache.urls.delete(filename);
    }
    cache.blobs.delete(filename);
};

/**
 * Downloads a file with caching of the blob and URL for performance.
 * @param {string} content - The content to be downloaded.
 * @param {string} filename - The desired filename for the download.
 * @param {string} type - The MIME type for the blob.
 */
const downloadFile = (content, filename, type = 'application/octet-stream') => {
    if (!cache.blobs.has(filename)) {
        const blob = new Blob([content], { type });
        cache.blobs.set(filename, blob);
    }

    const blob = cache.blobs.get(filename);
    const url = getCachedUrl(blob, filename);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Optional: Cleanup the cache after download to free memory
    setTimeout(() => cleanupCache(filename), 1000); // Allow time for download to complete
};

/**
 * Handles file selection and processing.
 */
document.querySelector("#file").addEventListener('change', async (e) => {
    const tbody = document.querySelector('tbody');
    tbody.innerHTML = ''; // Clear any existing rows

    const noResultsMessage = document.querySelector('#no-results');
    noResultsMessage.style.display = 'none';

    if (e.target.files.length > 0) {
        try {
            const file = e.target.files[0];
            const content = await readFile(file);
            const parsedJson = JSON.parse(content);
            const subtitles = extractSubtitlesFromBcutJson(parsedJson);
            if (subtitles.length === 0) {
                noResultsMessage.style.display = 'block';
                return;
            }
            populateTable(subtitles, tbody);

            // Generate subtitle content in all formats
            const { srt, ass, txt, csv } = generateSubtitleFiles(subtitles);

            // Create and append buttons dynamically
            const downloadButtons = document.querySelector('#download-buttons');
            downloadButtons.innerHTML = ''; // Clear any existing buttons

            const buttonData = [
                { label: '导出 SRT', content: srt, extension: '.srt', type: 'text/plain' },
                { label: '导出 ASS', content: ass, extension: '.ass', type: 'text/plain' },
                { label: '导出 TXT', content: txt, extension: '.txt', type: 'text/plain' },
                { label: '导出 CSV', content: csv, extension: '.csv', type: 'text/csv' },
            ];

            buttonData.forEach(({ label, content, extension, type }) => {
                const button = document.createElement('button');
                button.textContent = label;
                button.addEventListener('click', () => {
                    const filename = generateExportFileName(file.name, extension);
                    downloadFile(content, filename, type);
                });
                downloadButtons.appendChild(button);
            });
        } catch (error) {
            console.error("Error processing file:", error);
            alert("文件处理失败，请确保上传正确的 JSON 文件。");
        }
    }
});


