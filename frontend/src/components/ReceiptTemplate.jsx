import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

// Register Thai fonts
Font.register({
  family: "NotoSansThai",
  fonts: [
    { src: `${window.location.origin}/fonts/NotoSansThai-Regular.ttf` },
    { src: `${window.location.origin}/fonts/NotoSansThai-Bold.ttf`, fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "NotoSansThai",
  },
  header: {
    borderBottom: "2px solid #333",
    paddingBottom: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },
  subTitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#555",
    marginTop: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bold: {
    fontWeight: "bold",
  },
  table: {
    display: "table",
    width: "auto",
    marginTop: 20,
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#bfbfbf",
  },
  tableRow: {
    margin: "auto",
    flexDirection: "row",
  },
  tableColHeader: {
    width: "50%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#bfbfbf",
    backgroundColor: "#f2f2f2",
    padding: 5,
  },
  tableCol: {
    width: "50%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#bfbfbf",
    padding: 5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },
  totalText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 10,
    color: "#888",
    borderTop: "1px solid #eee",
    paddingTop: 10,
  }
});

const ReceiptTemplate = ({
  receiptNo,
  date,
  customerName,
  items,
  totalAmount,
  organizationName = "RegisterSystem_Sci"
}) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>ใบเสร็จรับเงิน (Receipt)</Text>
          <Text style={styles.subTitle}>{organizationName}</Text>
        </View>

        <View style={styles.row}>
          <Text><Text style={styles.bold}>เลขที่ใบเสร็จ:</Text> {receiptNo}</Text>
          <Text><Text style={styles.bold}>วันที่:</Text> {date}</Text>
        </View>
        <View style={styles.row}>
          <Text><Text style={styles.bold}>ได้รับเงินจาก:</Text> {customerName}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}><Text style={styles.bold}>รายการ (Description)</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.bold}>จำนวนเงิน (Amount)</Text></View>
          </View>

          {items.map((item, i) => (
            <View style={styles.tableRow} key={i}>
              <View style={styles.tableCol}><Text>{item.description}</Text></View>
              <View style={styles.tableCol}><Text>{Number(item.amount).toLocaleString()} บาท</Text></View>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalText}>รวมเงินทั้งสิ้น: {Number(totalAmount).toLocaleString()} บาท</Text>
        </View>

        <View style={styles.footer}>
          <Text>เอกสารฉบับนี้ออกโดยระบบอัตโนมัติ ไม่จำเป็นต้องมีลายเซ็น</Text>
        </View>
      </Page>
    </Document>
  );
};

export default ReceiptTemplate;
