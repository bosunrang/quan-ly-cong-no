# Kế hoạch chuyển sang kiến trúc của app cước phí

Cập nhật: 19/11/2026. Mục tiêu: app công nợ có **một đường dữ liệu duy nhất qua máy chủ** như app
"Quản lý cước phí", nhưng giữ nguyên phần tính tiền TypeScript đã có kiểm thử.

## Vì sao phải chuyển

| | App công nợ hiện tại | App cước phí (đích đến) |
|---|---|---|
| Đường dữ liệu | Ba nhánh: trình duyệt (localStorage/IndexedDB), desktop (Electron gọi thẳng SQLite), LAN (`server/lan.cjs`) | Một đường: giao diện, kể cả trong Electron, gọi HTTP tới máy chủ nội bộ |
| Nơi tính toán | Trình duyệt tải **cả sổ** rồi tự tính công nợ, phân bổ, báo cáo | Máy chủ tính, lọc và phân trang |
| Lưu trữ sổ | Sổ bán hàng và sổ khoản thu là **một khối JSON** trong `app_datasets` | Mỗi loại dữ liệu một bảng |
| API | Một điểm vào, máy trạm gửi tên thao tác và gửi lại cả danh sách | REST theo route, một HTTP client duy nhất |
| Phân quyền | Máy chủ so cả danh sách cũ/mới để đoán quyền; bản desktop không qua lớp kiểm tra này | Mặc định cấm, kiểm quyền theo từng route; desktop cũng đi qua máy chủ |

Hệ quả hiện tại: kiểm tra dữ liệu bị lặp ở hai nơi, phải tải nguyên sổ (có bộ đệm `datasetCache`
để đỡ chậm), danh mục trên LAN còn đọc đồng bộ, logic desktop và LAN có thể lệch nhau.

## Nguyên tắc cho mọi giai đoạn

- **Số tiền không được đổi.** Có bộ test "số tiền chuẩn" lấy từ dữ liệu thật; mọi giai đoạn phải ra
  đúng từng đồng.
- Mỗi giai đoạn tự đứng được và phát hành riêng được.
- Đổi cấu trúc dữ liệu chỉ bằng bước migration mới, app tự sao tệp trước khi nâng cấp.
- Logic tính tiền ở `src/domain` được dùng chung cho máy chủ, không viết lại bằng JavaScript.

## Giai đoạn 0. Dọn nền (nhỏ)

Đã xong:
- [x] Xóa module của app chiết khấu cũ (sản phẩm, chính sách, đơn hàng, đối soát cũ) và test của chúng.
- [x] Gỡ lệnh SQLite cũ, bỏ trường người nhận, xóa bảng cũ và đổi khóa `mkt-cost.*` → `cong-no.*` (migration v12).
- [x] Đổi tên định danh app, cầu nối `congNoDatabase`, header `X-Cong-No-*`, biến môi trường `CONG_NO_LAN_*`.
- [x] Viết lại `ARCHITECTURE.md`.

Còn lại:
- [ ] Commit trạng thái hiện tại.
- [ ] Viết **test số tiền chuẩn**: từ một bản sao lưu thật, ghi lại công nợ từng khách tại vài ngày chốt,
  biên bản đối chiếu của vài khách và các số trên Dashboard.

## Giai đoạn 1. Một đường dữ liệu (vừa)

- Bản desktop luôn tự chạy máy chủ ngay trong app (`127.0.0.1`, hoặc `0.0.0.0` khi làm máy chủ LAN);
  giao diện gọi HTTP như máy trạm.
- Gỡ cầu nối SQLite trong `preload` (`congNoDatabase`), bỏ chế độ chỉ chạy trên trình duyệt.
  Chạy dev dùng máy chủ ở chế độ loopback như app cước phí.
- Tệp `cong-no.sqlite` của bản desktop có cùng cấu trúc với tệp của máy chủ nên dùng thẳng được.
- Bản desktop dùng một máy cũng đăng nhập (dùng luồng tạo admin lần đầu đã có).

**Xong khi:** `src/domain` không còn nhánh `getDatabaseBridge`/`lanEndpoint()`; số tiền chuẩn khớp;
chạy thử Electron và LAN đều được.

## Giai đoạn 2. API theo route (lớn)

- Lấy bộ định tuyến của app cước phí (`server/http.cjs`, `server/index.cjs`): `PUBLIC_ROUTES` mặc định
  cấm, mỗi route khai báo thẻ quyền và giới hạn dung lượng gửi lên, lỗi có mã HTTP.
- Một HTTP client duy nhất `src/shared/api/client.ts`. Mọi đọc dữ liệu thành bất đồng bộ: hết XHR
  đồng bộ, các trang có trạng thái đang tải.
- Khách hàng, nhân viên, phân công sửa theo từng bản ghi (POST/PATCH/DELETE) → bỏ việc so cả danh sách
  để đoán quyền (`requireCustomerChangePermission`) và revision của cả danh mục.
- Giữ đăng nhập bằng cookie HttpOnly hiện tại.

**Xong khi:** không còn `requestLanSync`; mỗi route có test ranh giới quyền.

## Giai đoạn 3. Bảng riêng cho sổ (lớn)

- Migration v13: bảng `sales_lines` (đánh chỉ mục theo mã khách, ngày, chứng từ), `receipts`,
  `allocations`, `allocation_lines`, `reversals`. Khi nâng cấp kiểm tra tổng tiền khớp với khối JSON
  cũ, lệch thì hủy.
- Nhập MISA: máy trạm đọc Excel bằng worker như hiện tại; máy chủ có bước xem trước và bước xác nhận,
  ghi trong một giao dịch.
- Ghi khoản thu, phân bổ, đảo phiếu theo từng thao tác, ghi nhật ký trong cùng giao dịch.
- Định dạng tệp sao lưu JSON giữ nguyên để bản sao lưu cũ vẫn khôi phục được.

**Xong khi:** `app_datasets` không còn chứa sổ bán hàng và sổ khoản thu; số tiền chuẩn khớp.

## Giai đoạn 4. Máy chủ tính, máy trạm hiển thị (lớn)

- Đóng gói `src/domain` cho máy chủ (build SSR bằng Vite ra `server/generated/domain.cjs`) để dùng
  chung công thức và chung test.
- Route có lọc và phân trang ở máy chủ: công nợ phải thu, hóa đơn từng khách, Dashboard, biên bản
  đối chiếu, danh sách khoản thu, ứng viên phân bổ.
- Bỏ `datasetCache` và việc tải nguyên sổ về máy trạm. Thêm script đo hiệu năng như
  `tests/performance` của app cước phí.

## Giai đoạn 5. Hoàn thiện (tùy chọn)

Ghi log ra tệp, tự cập nhật (`electron-updater`), máy desktop làm máy trạm của máy chủ khác, truy cập
từ xa qua Cloudflare Tunnel, `ARCHITECTURE.md` với đầy đủ quy tắc như app cước phí.

## Quyết định đã chốt (19/11/2026)

| Câu hỏi | Quyết định |
|---|---|
| Desktop dùng một máy cũng bắt buộc đăng nhập? | Có, như app cước phí |
| Một máy chủ nhiều công ty theo đường dẫn (hiện tại) hay mỗi công ty một cổng (app cước phí)? | Giữ như hiện tại |
| Bỏ chế độ chỉ chạy trên trình duyệt? | Có |
| Đăng nhập bằng cookie HttpOnly (hiện tại) hay token trong `sessionStorage` (app cước phí)? | Giữ cookie, an toàn hơn |

## Rủi ro

- **Sai số tiền khi chuyển logic:** chặn bằng test số tiền chuẩn ở mọi giai đoạn.
- **Hỏng dữ liệu khi đổi cấu trúc:** migration trong giao dịch, kiểm tra tổng trước khi ghi, sao tệp trước khi nâng cấp.
- **Gián đoạn máy trạm:** máy chủ và máy trạm luôn cùng phiên bản vì máy trạm tải giao diện từ máy chủ; nâng cấp ngoài giờ làm việc.
