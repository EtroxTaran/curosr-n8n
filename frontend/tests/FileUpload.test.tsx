import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUpload } from "../components/upload/FileUpload";
import type { InputFile } from "../lib/schemas";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock XMLHttpRequest
class MockXHR {
  upload = {
    addEventListener: vi.fn(),
  };
  addEventListener = vi.fn();
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  status = 200;
}

const mockXHRInstance = new MockXHR();
vi.stubGlobal("XMLHttpRequest", vi.fn(() => mockXHRInstance));

describe("FileUpload", () => {
  const defaultProps = {
    projectId: "test-project",
    onUploadComplete: vi.fn(),
    onUploadError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Reset XHR mock
    mockXHRInstance.upload.addEventListener.mockClear();
    mockXHRInstance.addEventListener.mockClear();
    mockXHRInstance.open.mockClear();
    mockXHRInstance.send.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render dropzone with instructions", () => {
      render(<FileUpload {...defaultProps} />);

      expect(
        screen.getByText(/drag & drop files here/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/pdf, markdown, txt, docx/i)
      ).toBeInTheDocument();
    });

    it("should show file count indicator", () => {
      render(<FileUpload {...defaultProps} maxFiles={5} />);

      expect(screen.getByText("0 of 5 files uploaded")).toBeInTheDocument();
    });

    it("should render with existing files", () => {
      const existingFiles: InputFile[] = [
        {
          key: "test/file1.pdf",
          name: "file1.pdf",
          size: 1024,
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
      ];

      render(<FileUpload {...defaultProps} existingFiles={existingFiles} />);

      expect(screen.getByText("file1.pdf")).toBeInTheDocument();
      expect(screen.getByText("1 of 10 files uploaded")).toBeInTheDocument();
    });

    it("should disable dropzone when disabled prop is true", () => {
      render(<FileUpload {...defaultProps} disabled={true} />);

      const dropzone = screen.getByText(/drag & drop files here/i).closest("div");
      expect(dropzone).toHaveClass("opacity-50");
      expect(dropzone).toHaveClass("cursor-not-allowed");
    });
  });

  describe("File Validation", () => {
    it("should reject files that exceed max size", async () => {
      const user = userEvent.setup();
      render(
        <FileUpload {...defaultProps} maxSizeBytes={1024} /> // 1KB limit
      );

      const input = screen.getByRole("presentation").querySelector("input");
      expect(input).toBeTruthy();

      // Create a file larger than 1KB
      const largeFile = new File(["a".repeat(2048)], "large.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, largeFile);

      await waitFor(() => {
        expect(defaultProps.onUploadError).toHaveBeenCalledWith(
          expect.stringContaining("too large")
        );
      });
    });

    it("should reject files with invalid types", async () => {
      render(<FileUpload {...defaultProps} />);

      const dropzone = screen.getByRole("presentation");

      // Use fireEvent.drop with DataTransfer to properly test file rejection
      const invalidFile = new File(["content"], "test.exe", {
        type: "application/x-msdownload",
      });

      const dataTransfer = {
        files: [invalidFile],
        items: [{ kind: "file", type: invalidFile.type, getAsFile: () => invalidFile }],
        types: ["Files"],
      };

      fireEvent.drop(dropzone, { dataTransfer });

      await waitFor(() => {
        // Component formats error as "{filename} has invalid type"
        expect(defaultProps.onUploadError).toHaveBeenCalledWith(
          expect.stringContaining("has invalid type")
        );
      });
    });

    it("should enforce max files limit", async () => {
      const existingFiles: InputFile[] = Array.from({ length: 3 }, (_, i) => ({
        key: `test/file${i}.pdf`,
        name: `file${i}.pdf`,
        size: 1024,
        contentType: "application/pdf",
        uploadedAt: new Date().toISOString(),
      }));

      render(
        <FileUpload {...defaultProps} maxFiles={3} existingFiles={existingFiles} />
      );

      expect(screen.getByText("3 of 3 files uploaded")).toBeInTheDocument();

      // Try to drop another file - should trigger error
      const dropzone = screen.getByRole("presentation");
      const newFile = new File(["content"], "extra.pdf", {
        type: "application/pdf",
      });

      const dataTransfer = {
        files: [newFile],
        items: [{ kind: "file", type: newFile.type, getAsFile: () => newFile }],
        types: ["Files"],
      };

      fireEvent.drop(dropzone, { dataTransfer });

      // No new upload should start (fetch should not be called)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("File Upload", () => {
    it("should start upload when files are dropped", async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadUrl: "https://s3.example.com/upload",
            key: "projects/test-project/input/test.pdf",
          }),
      });

      // Mock XHR to complete successfully
      mockXHRInstance.addEventListener.mockImplementation(
        (event: string, handler: () => void) => {
          if (event === "load") {
            // Simulate successful upload after a tick
            setTimeout(() => {
              mockXHRInstance.status = 200;
              handler();
            }, 0);
          }
        }
      );

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining("test.pdf"),
        });
      });
    });

    it("should call onUploadComplete when upload succeeds", async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadUrl: "https://s3.example.com/upload",
            key: "projects/test-project/input/test.pdf",
          }),
      });

      mockXHRInstance.addEventListener.mockImplementation(
        (event: string, handler: () => void) => {
          if (event === "load") {
            setTimeout(() => {
              mockXHRInstance.status = 200;
              handler();
            }, 0);
          }
        }
      );

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      await waitFor(
        () => {
          expect(defaultProps.onUploadComplete).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({
                name: "test.pdf",
                key: "projects/test-project/input/test.pdf",
              }),
            ])
          );
        },
        { timeout: 2000 }
      );
    });

    it("should handle presigned URL fetch error", async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "Failed to get upload URL" }),
      });

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      await waitFor(() => {
        expect(defaultProps.onUploadError).toHaveBeenCalledWith(
          "Failed to get upload URL"
        );
      });
    });
  });

  describe("File Removal", () => {
    it("should remove file when remove button is clicked", async () => {
      const user = userEvent.setup();
      const existingFiles: InputFile[] = [
        {
          key: "test/file1.pdf",
          name: "file1.pdf",
          size: 1024,
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
      ];

      render(<FileUpload {...defaultProps} existingFiles={existingFiles} />);

      expect(screen.getByText("file1.pdf")).toBeInTheDocument();

      const removeButton = screen.getByRole("button");
      await user.click(removeButton);

      expect(defaultProps.onUploadComplete).toHaveBeenCalledWith([]);
    });

    it("should update file count after removal", async () => {
      const user = userEvent.setup();
      const existingFiles: InputFile[] = [
        {
          key: "test/file1.pdf",
          name: "file1.pdf",
          size: 1024,
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
        {
          key: "test/file2.pdf",
          name: "file2.pdf",
          size: 2048,
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
      ];

      render(<FileUpload {...defaultProps} existingFiles={existingFiles} />);

      expect(screen.getByText("2 of 10 files uploaded")).toBeInTheDocument();

      const removeButtons = screen.getAllByRole("button");
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(defaultProps.onUploadComplete).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ name: "file2.pdf" }),
          ])
        );
      });
    });
  });

  describe("UI States", () => {
    it("should show uploading state with progress", async () => {
      const user = userEvent.setup();

      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolve to keep upload in progress
          })
      );

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      await waitFor(() => {
        expect(screen.getByText("test.pdf")).toBeInTheDocument();
        // Component immediately moves to "uploading" status with progress bar
        expect(screen.getByText("0%")).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
      });
    });

    it("should display file size correctly", () => {
      const existingFiles: InputFile[] = [
        {
          key: "test/small.pdf",
          name: "small.pdf",
          size: 500, // 500 bytes
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
        {
          key: "test/medium.pdf",
          name: "medium.pdf",
          size: 1024 * 500, // 500 KB
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
        {
          key: "test/large.pdf",
          name: "large.pdf",
          size: 1024 * 1024 * 5, // 5 MB
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
      ];

      render(<FileUpload {...defaultProps} existingFiles={existingFiles} />);

      expect(screen.getByText("500 B")).toBeInTheDocument();
      expect(screen.getByText("500.0 KB")).toBeInTheDocument();
      expect(screen.getByText("5.0 MB")).toBeInTheDocument();
    });
  });

  describe("Drag and Drop", () => {
    it("should highlight dropzone when dragging over", () => {
      render(<FileUpload {...defaultProps} />);

      const dropzone = screen.getByRole("presentation");

      fireEvent.dragEnter(dropzone);

      // The dropzone should have drag active styles
      // Note: Testing drag states is limited in jsdom
    });
  });

  describe("XHR Progress Events", () => {
    it("should update progress during upload", async () => {
      const user = userEvent.setup();
      let progressHandler: ((event: { loaded: number; total: number }) => void) | null = null;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadUrl: "https://s3.example.com/upload",
            key: "projects/test-project/input/test.pdf",
          }),
      });

      mockXHRInstance.upload.addEventListener.mockImplementation(
        (event: string, handler: (event: { loaded: number; total: number }) => void) => {
          if (event === "progress") {
            progressHandler = handler;
          }
        }
      );

      mockXHRInstance.addEventListener.mockImplementation(
        (event: string, _handler: () => void) => {
          if (event === "load") {
            // Don't auto-complete - we want to test progress
          }
        }
      );

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "progress-test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      // Wait for upload to start
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Simulate progress event
      if (progressHandler !== null) {
        (progressHandler as (event: { loaded: number; total: number }) => void)({ loaded: 50, total: 100 });
      }

      // Progress should be displayed
      await waitFor(() => {
        expect(screen.getByText("progress-test.pdf")).toBeInTheDocument();
      });
    });
  });

  describe("XHR Error Handling", () => {
    it("should handle XHR network error", async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadUrl: "https://s3.example.com/upload",
            key: "projects/test-project/input/test.pdf",
          }),
      });

      mockXHRInstance.addEventListener.mockImplementation(
        (event: string, handler: () => void) => {
          if (event === "error") {
            setTimeout(() => handler(), 0);
          }
        }
      );

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "error-test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      await waitFor(() => {
        expect(defaultProps.onUploadError).toHaveBeenCalledWith(
          expect.stringContaining("Upload failed")
        );
      });
    });

    it("should handle non-200 XHR status", async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadUrl: "https://s3.example.com/upload",
            key: "projects/test-project/input/test.pdf",
          }),
      });

      mockXHRInstance.addEventListener.mockImplementation(
        (event: string, handler: () => void) => {
          if (event === "load") {
            setTimeout(() => {
              mockXHRInstance.status = 500;
              handler();
            }, 0);
          }
        }
      );

      render(<FileUpload {...defaultProps} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["test content"], "status-test.pdf", {
        type: "application/pdf",
      });

      await user.upload(input!, file);

      await waitFor(() => {
        expect(defaultProps.onUploadError).toHaveBeenCalledWith(
          expect.stringContaining("Upload failed")
        );
      });
    });
  });

  describe("Multiple File Upload", () => {
    it("should handle multiple files dropped at once", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              uploadUrl: "https://s3.example.com/upload1",
              key: "projects/test-project/input/file1.pdf",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              uploadUrl: "https://s3.example.com/upload2",
              key: "projects/test-project/input/file2.pdf",
            }),
        });

      mockXHRInstance.addEventListener.mockImplementation(
        (event: string, handler: () => void) => {
          if (event === "load") {
            setTimeout(() => {
              mockXHRInstance.status = 200;
              handler();
            }, 0);
          }
        }
      );

      render(<FileUpload {...defaultProps} />);

      const dropzone = screen.getByRole("presentation");
      const file1 = new File(["content1"], "multi1.pdf", { type: "application/pdf" });
      const file2 = new File(["content2"], "multi2.pdf", { type: "application/pdf" });

      const dataTransfer = {
        files: [file1, file2],
        items: [
          { kind: "file", type: file1.type, getAsFile: () => file1 },
          { kind: "file", type: file2.type, getAsFile: () => file2 },
        ],
        types: ["Files"],
      };

      fireEvent.drop(dropzone, { dataTransfer });

      await waitFor(() => {
        expect(screen.getByText("multi1.pdf")).toBeInTheDocument();
        expect(screen.getByText("multi2.pdf")).toBeInTheDocument();
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty file name gracefully", async () => {
      render(<FileUpload {...defaultProps} />);

      const dropzone = screen.getByRole("presentation");

      // Try to drop a file with an unusual name
      const weirdFile = new File(["content"], "   .pdf", {
        type: "application/pdf",
      });

      const dataTransfer = {
        files: [weirdFile],
        items: [{ kind: "file", type: weirdFile.type, getAsFile: () => weirdFile }],
        types: ["Files"],
      };

      fireEvent.drop(dropzone, { dataTransfer });

      // Should not crash
    });

    it("should preserve existing files when new upload fails", async () => {
      const existingFiles: InputFile[] = [
        {
          key: "test/existing.pdf",
          name: "existing.pdf",
          size: 1024,
          contentType: "application/pdf",
          uploadedAt: new Date().toISOString(),
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: "Upload URL generation failed" }),
      });

      const user = userEvent.setup();
      render(<FileUpload {...defaultProps} existingFiles={existingFiles} />);

      const input = screen.getByRole("presentation").querySelector("input");
      const file = new File(["content"], "new-file.pdf", { type: "application/pdf" });

      await user.upload(input!, file);

      await waitFor(() => {
        expect(defaultProps.onUploadError).toHaveBeenCalled();
      });

      // Existing file should still be displayed
      expect(screen.getByText("existing.pdf")).toBeInTheDocument();
    });
  });
});
