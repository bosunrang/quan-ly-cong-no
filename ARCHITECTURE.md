# Kiến trúc Quản lý công nợ

Ứng dụng quản lý công nợ phải thu của khách hàng từ Sổ chi tiết bán hàng MISA: nhập sổ bán hàng,
ghi và phân bổ khoản thu, theo dõi công nợ, lập biên bản đối chiếu. React + TypeScript + Vite trong
vỏ Electron, mọi giao diện đều gọi máy chủ HTTP; bản desktop tự chạy máy chủ loopback hoặc LAN. Mã tổ chức theo module nghiệp vụ; component
giao diện không tự đọc/ghi dữ liệu.

## Cấu trúc chuẩn

```text
src/
  app/                 Điều phối ứng dụng, cấu hình trang, điều hướng, đăng nhập
    layout/            Header, Sidebar và app shell
  domain/              Model và quy tắc nghiệp vụ, không phụ thuộc React/CSS
    access/            Tài khoản, mật khẩu, thẻ truy cập
    assignments/       Quy tắc giao, chuyển và kết thúc phụ trách
    customers/         Hồ sơ khách hàng, tỉnh/thành, repository
    employees/         Nhân viên kinh doanh, repository
    misa/              Sổ bán hàng MISA và cách gom thành chứng từ/công nợ
    payments/          Sổ khoản thu: phân bổ, đảo phiếu, công nợ theo hóa đơn
    settings/          Cài đặt, thông tin bên bán, sao lưu/khôi phục
  features/            Module màn hình độc lập
    dashboard/         Tổng quan công nợ
    misa/              Nhập và đối chiếu lại Sổ chi tiết bán hàng
    receivables/       Công nợ phải thu theo khách hàng và hóa đơn
    payments/          Ghi khoản thu và phân bổ vào hóa đơn
    reports/           Biên bản đối chiếu công nợ (in, Excel)
    customers/         Danh mục khách hàng, nhập Excel
    sales/             Nhân viên và phân công khách hàng
    accounts/          Người dùng và quyền
    activity/          Nhật ký sử dụng
    settings/          Thông tin doanh nghiệp, dữ liệu, sao lưu
  shared/
    hooks/             Hook dùng chung (phân trang, thông báo, lỗi lưu trữ)
    lib/               Ngày tháng, đọc Excel (Web Worker), tiện ích nhỏ
    api/client.ts      HTTP client bất đồng bộ dùng chung
    storage/           Lỗi lưu trữ và bộ đệm sổ
    ui/                Component dùng chung: Dialog, DateInput, StatusPill, Notice...
  styles/
    index.css          Điểm nhập CSS duy nhất, quy định thứ tự cascade
    foundation/        Font, token, reset/base và typography
    layout/            App shell và responsive toàn ứng dụng
    shared/            Style của component dùng chung
electron/              Vỏ desktop, SQLite (database.cjs), máy chủ loopback/LAN
server/                Máy chủ dùng chung, định tuyến (http.cjs), API (index.cjs), sao lưu và khởi chạy dev
tests/                 Vitest cho src; node --test cho SQLite và máy chủ LAN
```

## Quy tắc bắt buộc

1. Màu, cỡ chữ và kích thước shell lấy từ `styles/foundation/tokens.css`; không viết mã màu riêng trong component mới.
2. Model, repository và quy tắc nghiệp vụ nằm trong `domain`; UI và state màn hình nằm trong `features`.
3. UI chỉ nhận dữ liệu và callback qua props hoặc hook của feature; không gọi trực tiếp `localStorage`, SQLite hay API.
4. Mọi phép tính tiền (công nợ, phân bổ, số dư đối chiếu) nằm trong `domain` và có kiểm thử; dashboard, báo cáo và màn hình thu tiền dùng chung, không tự tính lại.
5. Dữ liệu MISA được đọc qua adapter kiểm tra tiêu đề và định dạng số trước khi vào model chuẩn; nhập lại theo từng chứng từ, người dùng xem trước rồi mới ghi.
6. Chứng từ đã có khoản thu phân bổ không bị thay hay gỡ khi nhập lại sổ.
7. Ghi sổ bán hàng và sổ khoản thu dùng kiểm tra phiên bản (`importedAt`, `revision`) để không ghi đè thay đổi của máy khác.
8. Ẩn menu không phải là phân quyền: máy chủ kiểm tra thẻ truy cập và cấu trúc dữ liệu trước khi đọc/ghi.
9. CSS riêng của feature đặt cạnh feature đó; CSS nền chỉ import qua `styles/index.css`.
10. Feature không import model, logic hoặc CSS của feature khác. Phần dùng chung chuyển vào `domain` hoặc `shared`.
11. Page chỉ điều phối state và use case; khối giao diện có trách nhiệm riêng tách vào `components`.
12. Khóa lưu trữ (`cong-no.*`) và migration thuộc repository/`electron/database.cjs`. Không đổi khóa khi refactor; nếu bắt buộc phải đổi thì làm bằng bước migration (như v12).
13. Schema SQLite đổi bằng bước migration mới, chạy trong transaction; không sửa bước đã chạy. App tạo bản sao tệp trước mỗi lần nâng cấp.
14. Trạng thái dạng nhãn dùng `shared/ui/StatusPill` với đúng năm ngữ nghĩa: `success`, `warning`, `info`, `neutral`, `danger`.

## Hướng phụ thuộc

```text
app ──> features ──> domain
 │          │           │
 └────────> shared <────┘

domain  -X-> features
feature -X-> feature khác
shared  -X-> features/domain nghiệp vụ
```

`domain` phải chạy được không cần React. `shared/ui` chỉ chứa giao diện tổng quát.

## Luồng dữ liệu

```text
Excel MISA ─> Web Worker đọc ô ─> adapter kiểm tra ─> xem trước theo chứng từ ─> Sổ bán hàng
                                                                                     │
Khoản thu ─> phân bổ vào hóa đơn ─> Sổ khoản thu ─────────────────────────────────────┤
                                                                                     v
                                     Công nợ phải thu · Dashboard · Biên bản đối chiếu
```

Có một đường dữ liệu: giao diện → HTTP cùng nguồn → `server/lan.cjs` → SQLite.
Mọi chế độ đều đăng nhập bằng cookie HttpOnly và được máy chủ kiểm tra quyền.

- **Desktop cục bộ:** tự mở máy chủ tại `127.0.0.1` với cổng tự chọn; mở trực tiếp
  `cong-no.sqlite` trong `userData` cũ. Không có preload hoặc IPC truy cập dữ liệu.
- **Máy chủ LAN:** desktop và máy trạm cùng gọi HTTP; giữ nguyên công ty, cổng và tệp SQLite hiện có.
- **Phát triển:** `pnpm dev` tự mở máy chủ loopback, Vite chuyển tiếp `/api/` cùng nguồn.
  Dữ liệu phát triển ở `data/dev/cong-no.sqlite`; tạo admin bằng `pnpm dev:init-admin`.
  `pnpm preview` phục vụ bản build qua cùng máy chủ và cùng kho phát triển.

Không có chế độ lưu nghiệp vụ trên trình duyệt. Thiếu endpoint hoặc mất kết nối thì báo lỗi,
không chuyển sang một bản dữ liệu khác. Bản sao lưu cục bộ tiếp tục dùng `companyId: null` để
khôi phục được tệp JSON cũ.

Sổ bán hàng và sổ khoản thu được giữ trong bộ đệm dùng chung (`datasetCache`); máy trạm chỉ tải lại
khi dấu thay đổi của sổ khác bản đang giữ. Các giai đoạn chuyển đổi nằm trong [docs/KE-HOACH-CHUYEN-KIEN-TRUC.md](docs/KE-HOACH-CHUYEN-KIEN-TRUC.md).

## Lưu trữ và an toàn dữ liệu

- Dữ liệu ghi theo envelope `{ version, data }`; máy chủ và SQLite là nguồn duy nhất, không dùng bản sao trên trình duyệt thay thế.
- Lỗi đọc dữ liệu báo lên toàn ứng dụng và không ghi đè gì. UI chỉ báo thành công sau khi repository xác nhận đã ghi.
- Sao lưu tự động 14 bản theo ngày, và bản JSON trước mỗi thao tác xóa/khôi phục.
- Schema hiện tại: 12. Bước v12 bỏ các bảng của app chiết khấu cũ và đổi khóa `mkt-cost.*` sang `cong-no.*`.
  Bản sao lưu SQLite cũ được nâng cấp trên bản chép tạm khi đọc, tệp sao lưu gốc giữ nguyên.

## API và lưu danh mục

Máy chủ định tuyến theo phương thức và đường dẫn. Chỉ đăng nhập và nhận diện đăng nhập được mở công khai
qua danh sách cho phép. Mỗi route khai báo thẻ quyền và giới hạn dung lượng. Máy chủ kiểm quyền trước khi
đọc nội dung yêu cầu. Giao diện tải dữ liệu bất đồng bộ qua client dùng chung và dùng cookie HttpOnly.

Khách hàng, nhân viên và phân công ghi theo bản ghi. Thao tác hàng loạt chỉ gửi các bản ghi được chọn
và được xử lý trong một giao dịch. Máy chủ kiểm tra xung đột trên từng hồ sơ liên quan. Hai sổ lớn vẫn
dùng JSON trong app_datasets và bộ đệm datasetCache. Tách bảng và chuyển tính toán lên máy chủ thuộc
giai đoạn 3 và 4.

`pnpm check` kiểm tra kiến trúc, nghiệp vụ, SQLite và LAN; `pnpm test:desktop` (sau `pnpm build`)
chạy Electron với kho tạm để kiểm tra HTTP, dữ liệu SQLite cũ, đăng nhập, đổi mật khẩu và khôi phục cookie.
