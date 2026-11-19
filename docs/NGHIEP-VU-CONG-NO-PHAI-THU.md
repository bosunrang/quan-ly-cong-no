# Đặc tả nghiệp vụ quản lý công nợ phải thu khách hàng

Tài liệu đề xuất nghiệp vụ để phát triển app trên nền bố cục desktop hiện có. Mục tiêu là tra được khách hàng còn nợ bao nhiêu, khoản nào đến hạn, từng hóa đơn đã được thanh toán bằng chứng từ nào và phần tiền thu nào đang chờ phân bổ.

## 1. Phạm vi và màn hình

Phạm vi gồm công nợ phải thu khách hàng, số dư đầu kỳ, phát sinh phải thu, khoản thu, điều chỉnh, phân bổ và báo cáo tại ngày chốt. Đề xuất dùng VND cho lần triển khai đầu tiên. Nếu dữ liệu có ngoại tệ, cần xác nhận quy tắc theo dõi và quy đổi trước khi đưa vào sổ.

| Màn hình | Hiện trạng | Nghiệp vụ đề xuất |
| --- | --- | --- |
| Dashboard | Tổng số còn phải thu tại ngày chốt, tiền thu trong kỳ và tiền chưa phân bổ. Chọn chỉ tiêu để xem bảng chi tiết | Bổ sung số dư đầu kỳ, phải thu đến hạn và phải thu quá hạn khi có dữ liệu |
| Dữ liệu MISA | Nhập và tra cứu Sổ chi tiết bán hàng | Dùng luồng xem trước để nhận diện phát sinh phải thu từ sổ bán hàng. Bổ sung luồng nhập khoản thu và số dư đầu kỳ theo mẫu được xác nhận |
| Khách hàng | Danh mục, khu vực và người phụ trách | Thêm số dư tại ngày chốt, danh sách chứng từ còn mở, khoản thu, phân bổ và lịch sử phát sinh |
| Công nợ phải thu | Hiển thị giá trị sổ bán hàng, số đã thu từ phân bổ và số còn phải thu theo khách hàng và hóa đơn. Có bộ lọc nhân viên và khu vực | Bổ sung số dư đầu kỳ, điều chỉnh và hạn thanh toán theo khách hàng |
| Đối soát khoản thu | Đã ghi khoản thu thủ công, phân bổ vào chứng từ MISA, hoàn tác phân bổ và đảo khoản thu có lưu lịch sử | Bổ sung nhập file khoản thu từ mẫu MISA thực tế và đối chiếu cùng số dư đầu kỳ |
| Báo cáo | Lập biên bản đối chiếu theo khách hàng và kỳ tùy chọn, xuất Excel hoặc in PDF | Tổng hợp công nợ và tuổi nợ tại ngày chốt |
| Nhân viên & khu vực | Danh mục phân công đang hoạt động | Lọc danh sách và báo cáo theo nhân viên phụ trách hoặc khu vực |
| Người dùng, Nhật ký sử dụng, Cài đặt | Có tài khoản cục bộ, phân quyền theo vai trò và nhật ký truy cập, thao tác. Quản trị lọc nhật ký và xuất CSV | Đồng bộ tài khoản và nhật ký qua máy chủ khi triển khai dùng chung |

Các màn hình và hộp thoại mới dùng bộ thành phần desktop chung của app cho tìm kiếm, dropdown, bảng xem trước, trạng thái, cảnh báo và xác nhận thao tác.

## 2. Dữ liệu và quan hệ

| Đối tượng | Thông tin cần lưu | Vai trò |
| --- | --- | --- |
| Khách hàng | ID nội bộ, mã khách hàng MISA, tên, đơn vị quản lý nếu có, khu vực, người phụ trách | Liên kết chứng từ qua mã đã xác minh. Tên hỗ trợ tra cứu và đối chiếu |
| Chứng từ phải thu | ID nội bộ, khách hàng, đơn vị, loại chứng từ, số chứng từ, ký hiệu và số hóa đơn nếu có, ngày chứng từ, ngày hạch toán, hạn thanh toán, số tiền phải thu, nguồn | Là khoản phải thu có thể được thanh toán và theo dõi tuổi nợ |
| Khoản thu | ID nội bộ, khách hàng, đơn vị, mã loại và số chứng từ thu, ngày hạch toán, số tiền, phương thức nếu có, tham chiếu, nguồn | Ghi nhận tiền thực thu và số tiền còn có thể phân bổ |
| Số dư đầu kỳ | Khách hàng, ngày chốt đầu kỳ, số dư phải thu hoặc số dư có, tham chiếu chứng từ và hạn thanh toán nếu có, nguồn | Khởi tạo công nợ tại mốc chuyển dữ liệu vào app |
| Điều chỉnh | Chứng từ điều chỉnh, khách hàng, số tiền tăng hoặc giảm, ngày hiệu lực, lý do, tham chiếu gốc, nguồn | Ghi nhận nghiệp vụ như giảm trừ, hàng trả lại hoặc sửa sai đã được xác nhận |
| Phân bổ | ID, khoản thu hoặc khoản giảm được phép phân bổ, chứng từ phải thu đích, số tiền, ngày hiệu lực, người thao tác, trạng thái và tham chiếu hoàn tác | Cho phép một hóa đơn nhận nhiều lần thanh toán và một khoản thu thanh toán nhiều hóa đơn |
| Đợt nhập | Loại dữ liệu, tên và dấu nhận diện tệp, mốc thời gian, người nhập, kết quả theo dòng, bản ghi được tạo hoặc liên kết | Truy ngược số liệu và nhận diện lần nhập lại |

Khoản thu vẫn có số dư chưa phân bổ sau khi lưu. Phân bổ chỉ xác định khoản phải thu nào đã được bù và cập nhật số còn mở của chứng từ. Một khoản giảm hoặc số dư có đầu kỳ được theo dõi riêng theo nguồn và có thể được phân bổ nếu nghiệp vụ cho phép.

## 3. Nhập dữ liệu MISA và khởi tạo công nợ

### 3.1. Sổ chi tiết bán hàng

App hiện đọc và hiển thị 10 cột của file mẫu `So_chi_tiet_ban_hang (13).xlsx`.

| Nhóm | Cột đang hiển thị |
| --- | --- |
| Chứng từ | Ngày chứng từ, Số chứng từ, Số hóa đơn |
| Khách hàng và hàng hóa | Tên khách hàng, Tên hàng, ĐVT |
| Số lượng và tiền | Số lượng bán, Đơn giá, Doanh số bán, Tổng thanh toán |

File mẫu còn có ngày hạch toán, ký hiệu và ngày hóa đơn, mã khách hàng, mã hàng, TK Nợ, TK Có và thuế GTGT. Bước ghi nhận công nợ cần lấy các trường nguồn phục vụ nhận diện, phân loại và đối chiếu. Giữ số chứng từ, ký hiệu, số hóa đơn và mã khách hàng dưới dạng định danh để bảo toàn các số 0 ở đầu.

- Phân loại dòng bán theo quy tắc đã xác nhận với người phụ trách dữ liệu, có thể dùng TK Nợ hoặc căn cứ MISA phù hợp. Giao dịch có phát sinh phải thu và thu tiền cùng ngày vẫn đi theo luồng chứng từ, khoản thu và phân bổ. Dòng chưa đủ thông tin được giữ để đối chiếu.
- Ghép khách hàng theo mã đã xác minh trong phạm vi đơn vị quản lý. Khi mã thiếu hoặc chưa có trong danh mục, người nhập xác nhận liên kết hoặc bổ sung khách hàng trước khi ghi sổ. Tên trùng nhau chỉ dùng để gợi ý tra cứu.
- Gom các dòng hàng thành một chứng từ theo khóa nguồn đã xác minh. Đề xuất đối chiếu theo đơn vị phát hành, ký hiệu và số hóa đơn, đồng thời kiểm tra nhất quán khách hàng. Dòng thiếu số hóa đơn dùng khóa chứng từ nguồn khi đã kiểm tra tính duy nhất. Trường hợp chưa đủ căn cứ được đưa vào danh sách cần xử lý.
- Xác nhận cấp dữ liệu của cột **Tổng thanh toán**. Nếu là thành tiền từng dòng thì cộng các dòng hợp lệ. Nếu là tổng chứng từ lặp trên nhiều dòng thì lấy một lần sau khi đối chiếu. Kiểm tra số tiền với chứng từ MISA và tránh cộng thuế lần thứ hai nếu tổng đã gồm thuế.
- **Tổng thanh toán** trong sổ bán hàng dùng để xác định giá trị chứng từ. Tiền thực thu lấy từ chứng từ thu. Khoản âm cần có loại nghiệp vụ và chứng từ tham chiếu trước khi ghi giảm công nợ.

### 3.2. Khoản thu và số dư đầu kỳ

- Nguồn khoản thu cần cung cấp tối thiểu số chứng từ thu, khách hàng, ngày hạch toán và số tiền. Tham chiếu hóa đơn hỗ trợ đối soát nếu file có trường này. Kiểm tra khách hàng và số tiền trước khi ghi nhận phân bổ.
- Chốt số dư đầu kỳ tại một ngày cụ thể theo từng đơn vị. Ưu tiên số dư chi tiết theo chứng từ để tiếp tục theo dõi hóa đơn và tuổi nợ. Nếu chỉ có số dư theo khách hàng, tạo khoản đầu kỳ riêng và đánh dấu thiếu hạn cho đến khi bổ sung được căn cứ.
- Với cùng một phạm vi khách hàng và đơn vị, dùng một cấp số dư để ghi nhận. Nếu có cả tổng và chi tiết, dùng tổng để đối chiếu. Hóa đơn hoặc khoản thu đã nằm trong số dư đầu kỳ được đánh dấu khi nhập lại để tránh ghi hai lần.
- Chốt một ngày đầu kỳ theo quy ước số dư cuối ngày. Các phát sinh sau ngày đó mới đi vào sổ sau chuyển đổi. Nếu có nghiệp vụ trước ngày chốt phát hiện muộn, đối chiếu với nguồn rồi xử lý bằng phương án điều chỉnh đầu kỳ có ghi lịch sử.

### 3.3. Xem trước, lọc trùng và lưu

1. Chọn loại dữ liệu và file. App nhận diện dòng tiêu đề, đọc định dạng, chuẩn hóa mã, ngày và số tiền, rồi loại các dòng tiêu đề lặp hoặc tổng cộng.
2. Hiển thị bảng xem trước với các nhóm **Hợp lệ**, **Trùng** và **Cần xử lý**. Mỗi cảnh báo ghi dòng nguồn, lý do và bản ghi liên quan nếu đã tìm thấy. Hiển thị số dòng, số chứng từ và tổng tiền theo kết quả dự kiến.
3. Kiểm tra trùng trong file và với dữ liệu đã ghi sổ. Nhập lại chứng từ có khóa và nội dung đã xác nhận thì bỏ qua. Cùng khóa nhưng nội dung thay đổi thì yêu cầu đối chiếu. Hai dòng hàng giống nhau cần có căn cứ từ chứng từ nguồn trước khi xác định là một dòng bị lặp.
4. Người nhập xác nhận các bản ghi hợp lệ. Lưu giao dịch và kết quả đợt nhập cùng nhau để có thể nhập lại an toàn khi lần lưu gặp lỗi. Các dòng cần xử lý vẫn truy được theo file và số dòng.
5. Màn **Dữ liệu MISA** cho phép nhập Sổ chi tiết bán hàng từng tháng hoặc nhập file có khoảng ngày chồng nhau. Khi xác nhận, app giữ sổ hiện có và chỉ thêm **Dòng mới**. Các dòng đã có hoặc lặp trong file được bỏ qua. Dòng thuộc chứng từ có thay đổi nằm ở **Cần đối chiếu** để kiểm tra với MISA trước khi điều chỉnh số liệu đã lưu.

## 4. Đối soát và phân bổ khoản thu

1. Chọn khách hàng và khoản thu còn tiền chưa phân bổ. Hiển thị các khoản phải thu còn mở với số chứng từ, hạn thanh toán, số phải thu và số còn lại.
2. Ưu tiên gợi ý chứng từ theo tham chiếu xác minh được. Nếu dùng đề xuất theo hạn thanh toán thì hiển thị thứ tự và số tiền đề xuất để người dùng duyệt trước khi lưu.
3. Người dùng nhập số tiền cho một hoặc nhiều chứng từ. Mỗi dòng phải dương, cùng khách hàng, đơn vị và tiền tệ với nguồn phân bổ. Tổng theo khoản thu không vượt phần còn có thể dùng. Tổng theo chứng từ không vượt số phải thu còn mở. Kiểm tra lại các số dư ngay khi lưu.
4. Lưu cả nhóm phân bổ trong một giao dịch. Tiền thu trước hoặc thu thừa vẫn còn trên tài khoản khách hàng và có thể dùng cho chứng từ phát sinh sau.
5. Khi phân bổ sai, lưu giao dịch hoàn tác kèm ngày hiệu lực và lý do, trả tiền về phần chưa phân bổ và mở lại số dư chứng từ tương ứng. Có thể thực hiện phân bổ mới sau khi hoàn tác được lưu.

Ngày hiệu lực phân bổ phải từ ngày đủ điều kiện của cả nguồn và chứng từ đích trở đi. Ví dụ nếu tiền đã thu ngày 3 và hóa đơn được hạch toán ngày 5 thì báo cáo ngày 4 hiển thị tiền thu chưa phân bổ. Chỉ từ ngày 5 mới có thể ghi nhận phân bổ vào hóa đơn đó.

Sau khi chứng từ đã liên kết với phân bổ, các thay đổi làm lệch số dư cần đi qua thao tác điều chỉnh hoặc hoàn tác có tham chiếu. Nhật ký ghi đợt nhập, thay đổi liên kết khách hàng, xác nhận phân bổ, điều chỉnh và hoàn tác, kèm thời điểm, người thao tác và lý do nếu có.

Khi đảo một khoản thu đã phân bổ, hoàn tác các phân bổ liên quan và ghi nhận đảo khoản thu trong cùng giao dịch. Ngày hiệu lực xác định thời điểm số dư chứng từ mở lại và thời điểm giảm tiền thu trong báo cáo.

### Luồng đang dùng trong app

1. Chọn **Đối soát khoản thu → Ghi khoản thu**. App tự điền số chứng từ theo năm hạch toán (ví dụ `PT-2026-0001`). Có thể nhập số trên phiếu thu có sẵn. Chọn khách hàng, ngày hạch toán, nhập số tiền bằng đồng và tham chiếu hóa đơn nếu có. Số chứng từ thu được kiểm tra trùng trong năm hạch toán cho sổ của một đơn vị.
2. Mở chứng từ thu rồi chọn **Phân bổ khoản thu**. App lấy chứng từ bán hàng theo mã MISA khớp duy nhất trong danh mục. Với dòng có TK Nợ, app chỉ đưa vào danh sách khi thuộc 131. Sổ cũ thiếu TK Nợ vẫn dùng được sau khi kiểm tra với MISA. Chứng từ âm, thiếu tổng hoặc trùng khóa cần đối chiếu tại nguồn.
3. Nhập số phân bổ từng dòng và xác nhận đã đối chiếu số phải thu với MISA. Giá trị còn lại trong cửa sổ bằng giá trị chứng từ trừ phân bổ đã lưu trong app. Tiền thu dư vẫn hiển thị ở cột **Chưa phân bổ**.
4. Dùng **Hoàn tác** trong lịch sử để trả tiền về khoản thu. Dùng **Đảo khoản thu** để ghi nhận chứng từ thu bị đảo và hoàn tác đồng thời các phân bổ còn hiệu lực. Cả hai thao tác lưu ngày và lý do.

Luồng này dùng VND và một đơn vị phát hành. Cần file mẫu khoản thu và số dư đầu kỳ để bổ sung nhập Excel và tính công nợ thuần.

Màn **Công nợ phải thu** hiển thị **Đã thu** và **Còn phải thu** ở cấp khách hàng và hóa đơn. Đã thu là tổng phân bổ còn hiệu lực, còn phải thu là giá trị chứng từ đủ điều kiện trừ số đã thu. Khoản thu chưa phân bổ, số dư đầu kỳ và nghiệp vụ điều chỉnh được theo dõi riêng. Chứng từ thiếu căn cứ hoặc có dữ liệu MISA thay đổi so với lúc phân bổ hiện dấu gạch và được loại khỏi tổng số dư để đối chiếu.

Khi khoản thu thiếu tham chiếu, trong **Phân bổ khoản thu** dùng **Tìm nhóm khớp số tiền**. App tìm theo tổng số còn lại của các chứng từ đủ điều kiện của cùng khách hàng tại ngày phân bổ. Kết quả bị giới hạn khi có nhiều khả năng hoặc tổ hợp lớn. Kiểm tra ngày, số chứng từ và bảng kê của khách hàng. **Điền nhóm** chuẩn bị các dòng trong bảng để xem lại trước khi xác nhận phân bổ. Khi chưa xác định được nhóm chứng từ, giữ số tiền chưa rõ ở mục **Chưa phân bổ**.

## 5. Số dư, hạn thanh toán và tuổi nợ

### 5.1. Quy tắc tại ngày chốt

Mặc định xem số dư đến hết ngày được chọn. Lấy các nghiệp vụ có ngày hạch toán hoặc ngày hiệu lực đến ngày chốt, kể cả giao dịch điều chỉnh và hoàn tác. Kỳ thu tiền dùng khoảng ngày từ đầu kỳ đến cuối kỳ, bao gồm hai đầu mốc. Chọn ngày chốt khác để đối chiếu lại số liệu theo lịch sử.

| Chỉ tiêu | Cách tính |
| --- | --- |
| Phải thu còn mở của một chứng từ | Phải thu ghi nhận và các điều chỉnh tăng của chứng từ trừ phần đã được bù bằng phân bổ có hiệu lực |
| Tổng phải thu còn mở | Tổng số còn mở của các chứng từ bán chịu và khoản phải thu đầu kỳ trong phạm vi lọc |
| Tiền thu chưa phân bổ | Tổng tiền thực thu hợp lệ đến ngày chốt trừ phần tiền thu đã phân bổ có hiệu lực |
| Khoản giảm và số dư có đầu kỳ chưa phân bổ | Tổng nguồn giảm phải thu và số dư có đầu kỳ còn có thể dùng tại ngày chốt |
| Công nợ thuần theo khách hàng | Tổng phải thu còn mở trừ tiền thu chưa phân bổ và trừ khoản giảm, số dư có đầu kỳ chưa phân bổ |
| Tiền thu trong kỳ | Tổng khoản thu theo ngày hạch toán trong kỳ, sau khi tính các giao dịch đảo khoản thu có hiệu lực trong kỳ |

Khoản giảm trực tiếp vào một chứng từ được ghi nhận như phần bù có tham chiếu, để mỗi khoản giảm chỉ tác động một lần. Công nợ thuần âm được trình bày là dư có của khách hàng. Báo cáo tổng hợp giữ riêng tổng dư phải thu và tổng dư có theo khách hàng để thấy đúng khoản cần thu của từng bên.

### 5.2. Hạn thanh toán

- Ưu tiên hạn thanh toán có căn cứ ở chứng từ hoặc hợp đồng. Nếu thiếu và có chính sách đã xác nhận, tính hạn theo ngày gốc và số ngày của chính sách khách hàng, rồi lưu hạn và nguồn áp dụng trên chứng từ.
- Sổ chi tiết bán hàng mẫu thiếu hạn thanh toán. Khoản còn mở thiếu căn cứ được đưa vào nhóm **Chưa có hạn**, kèm tổng tiền và số chứng từ.
- Xét theo ngày chốt, khoản còn mở có hạn sau ngày chốt là **Chưa đến hạn**, hạn đúng ngày chốt là **Đến hạn**, và hạn trước ngày chốt là **Quá hạn**.
- Tình trạng thanh toán của hóa đơn được hiển thị riêng với hạn nợ. Dùng **Chưa thanh toán**, **Thanh toán một phần** và **Đã tất toán** theo số đã bù và số còn mở. Cho xem cơ cấu bù từ tiền thu, số dư có hoặc điều chỉnh trong chi tiết.
- Tuổi quá hạn bằng số ngày lịch từ hạn thanh toán đến ngày chốt. Các nhóm đề xuất là **1–30 ngày**, **31–60 ngày**, **61–90 ngày** và **Từ 91 ngày**. Chứng từ đã tất toán có số còn mở bằng 0.

### 5.3. Ví dụ tại ngày chốt 18/11

Hai hóa đơn và số dư đầu kỳ đã được ghi nhận trước 14/11. Khoản thu và các phân bổ trong bảng cùng có hiệu lực ngày 15/11.

| Nghiệp vụ | Ghi nhận | Phân bổ | Còn mở hoặc chưa phân bổ |
| --- | ---: | ---: | ---: |
| Phải thu đầu kỳ chưa rõ hạn | 300.000 | 0 | 300.000 |
| Hóa đơn A, hạn 10/11 | 1.200.000 | 1.200.000 | 0 |
| Hóa đơn B, hạn 25/11 | 800.000 | 200.000 | 600.000 |
| Khoản thu ngày 15/11 | 1.500.000 | 1.400.000 | 100.000 |

Khách hàng có **900.000 đồng phải thu còn mở** và **100.000 đồng thu chưa phân bổ**, tương ứng **800.000 đồng công nợ thuần**. Tuổi nợ gồm 600.000 đồng chưa đến hạn và 300.000 đồng chưa có hạn. Nếu xem tại ngày 14/11, hóa đơn A còn mở 1.200.000 đồng trong nhóm quá hạn 1–30 ngày.

## 6. Dashboard và báo cáo

| Màn hình | Cách sử dụng |
| --- | --- |
| Dashboard | Chọn ngày chốt và kỳ theo dõi tiền thu. Hiển thị tổng phải thu còn mở, đến hạn, quá hạn, tiền thu trong kỳ và tiền thu chưa phân bổ. Nhấn từng chỉ tiêu để mở danh sách cùng điều kiện lọc |
| Tổng hợp công nợ | Một dòng mỗi khách hàng với số dư đầu khoảng báo cáo, phát sinh tăng, tiền thu, điều chỉnh và công nợ thuần cuối khoảng. Có cột hoặc phần tổng riêng cho số còn mở, tiền thu chưa phân bổ và dư có |
| Chi tiết khách hàng | Xem số dư đầu khoảng, từng phát sinh theo ngày, số dư lũy kế, hóa đơn còn mở và phân bổ. Từ mỗi dòng mở được chứng từ liên quan và thông tin nguồn |
| Báo cáo tuổi nợ | Nhóm số còn mở theo hạn tại ngày chốt và cho mở tới từng chứng từ. Hiển thị riêng khoản chưa có hạn và phần chưa phân bổ để đối chiếu với công nợ thuần |

Các màn hình dùng chung bộ lọc ngày, khách hàng, đơn vị, người phụ trách và khu vực theo dữ liệu sẵn có. Tổng của các nhóm tuổi nợ phải bằng tổng phải thu còn mở trong cùng phạm vi. Báo cáo xuất Excel kèm ngày chốt, kỳ và phạm vi lọc để so sánh với số liệu trên màn hình.

## 7. Tiêu chí nghiệm thu

| Tình huống | Kết quả cần đạt |
| --- | --- |
| Một hóa đơn có nhiều dòng hàng | Hình thành một chứng từ phải thu với tổng khớp nguồn và truy được từng dòng |
| Có dòng giống nhau, nhập lại toàn bộ file hoặc nhập file chồng kỳ | Xem được dòng nghi trùng. Chứng từ đã xác nhận có cùng nội dung được bỏ qua. Khác nội dung được đưa ra đối chiếu |
| Thiếu mã khách hàng, thiếu định danh chắc chắn hoặc có dòng âm | Đợt xem trước chỉ ra dòng cần xử lý trước khi ghi sổ |
| Thu một phần nhiều lần hoặc một khoản thu trả nhiều hóa đơn | Giữ nguyên từng khoản thu, tra đủ phân bổ và số còn mở của mỗi chứng từ |
| Hai thao tác cùng phân bổ một khoản còn lại | Lần lưu sau kiểm tra lại số dư và báo số tiền còn có thể phân bổ nếu dữ liệu đã thay đổi |
| Thu trước, thu vượt hoặc hoàn tác phân bổ | Hiển thị đúng tiền chưa phân bổ và số dư chứng từ tại từng ngày chốt |
| Có cả file số dư tổng và file chi tiết hoặc nhập lại giao dịch đã nằm trong đầu kỳ | Đối chiếu được số tổng và phát sinh chỉ được tính một lần |
| Chứng từ thiếu hạn hoặc đến hạn đúng ngày chốt | Hiển thị đúng nhóm **Chưa có hạn** hoặc **Đến hạn**. Nhóm quá hạn chỉ gồm các chứng từ còn mở có hạn trước ngày chốt |
| Đối chiếu ba báo cáo | Tổng phải thu còn mở, công nợ thuần và các nhóm tuổi nợ khớp với chi tiết theo cùng ngày chốt và bộ lọc |

## 8. Trình tự triển khai và thông tin cần chốt

1. **Chuẩn hóa nguồn MISA.** Rà cấu trúc sổ bán hàng, bổ sung trường nhận diện chứng từ và khách hàng, thống nhất cách nhận biết bán chịu, cách cộng tiền và cách ghi nhận điều chỉnh.
2. **Khởi tạo sổ công nợ.** Dùng file mẫu khoản thu và số dư đầu kỳ thực tế để chốt ánh xạ, ngày chuyển sổ, quy tắc nhập lại và thẩm định số liệu với một nhóm khách hàng đại diện.
3. **Đối soát và khóa quy tắc số dư.** Hoàn thiện phân bổ, hoàn tác, nhật ký và quyền thao tác. Đối chiếu kết quả với các chứng từ có thu nhiều lần, thu trước và thu thừa.
4. **Lên Dashboard và báo cáo.** Chốt quy tắc hạn thanh toán, ngày gốc tính hạn, trường hợp thiếu hạn và đối chiếu tổng theo từng khách hàng với MISA tại cùng ngày.

Các quyết định cần xác nhận gồm mẫu chứng từ thu và số dư đầu kỳ, khóa nhận diện trong trường hợp có nhiều đơn vị, căn cứ phân loại phải thu và hạn thanh toán. Dữ liệu thực tế của các nguồn này sẽ quyết định đặc tả ánh xạ cột và tiêu chí đối chiếu trước khi ghi sổ.
