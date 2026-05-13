import fitz


def extract_pdf(file_path):
    text = ""

    with fitz.open(file_path) as doc:
        for page in doc:
            text += page.get_text()

    return text


if __name__ == "__main__":
    file_path = "invoice.pdf"

    try:
        extracted_text = extract_pdf(file_path)

        print(extracted_text)

        with open("output.txt", "w", encoding="utf-8") as f:
            f.write(extracted_text)

        print("Saved to output.txt")

    except Exception as e:
        print(f"Error: {e}")