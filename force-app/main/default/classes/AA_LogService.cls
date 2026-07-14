public with sharing class AA_LogService {
  // this can be set to a different logger if necessary - or use a service locator to select the appropriate service.
  //https://github.com/mlockett/ApexServiceLocator
  public static ILogger logger = new AA_Logger();

  //*******************************************************************
  // wrappers for logger
  //*******************************************************************

  /**
   * writes debug log with message data
   *
   * @param message message to be logged
   * @param className <class>.<method> if applicable
   */
  public static void debug(String message, String className) {
    logger.debug(message, className);
  }

  /**
   * writes info log with message data
   *
   * @param message message to be logged
   * @param className <class>.<method> if applicable
   */
  public static void info(String message, String className) {
    logger.info(message, className);
  }

  /**
   * writes warning log with message data
   *
   * @param message message to be logged
   * @param className <class>.<method> if applicable
   */
  public static void warn(String message, String className) {
    logger.warn(message, className);
  }

  /**
   * Write error with exception data
   *
   * @param ex exception to log
   * @param className <class>.<method> if applicable
   */
  public static void error(Exception ex, String className) {
    logger.error(ex, className);
  }

  /**
   * Write error with exception data
   *
   * @param ex exception to log
   * @param className <class>.<method> if applicable
   * @param affectedId record Id(s) related to log event
   */
  public static void error(Exception ex, String className, String affectedId) {
    logger.error(ex, className, affectedId);
  }

  /**
   * writes log with message data
   *
   * @param message message to be logged
   * @param className <class>.<method> if applicable
   */
  public static void error(String message, String className) {
    logger.error(message, className);
  }

  //*******************************************************************
  // end wrappers for logger
  //*******************************************************************

  /**
   * determines whether entry should be logged based on user and loglevel using LogRecordFilter__mdt
   *
   * @param currentUserId user id to evaluate
   * @param logLevel log level to evaluate
   *
   * @return whether entry should be logged
   */
  public static Boolean isLoggable(
    String currentUserId,
    LoggingLevel logLevel
  ) {
    return logger.isLoggable(currentUserId, logLevel);
  }

  /**
   * allow declaratively publishing log events
   * @param logs list of AppLogData
   */
  @InvocableMethod(
    Label='Write Log Data'
    Description='Writes desired data to AppLog'
  )
  public static void logData(List<AppLogData> logs) {
    for (AppLogData dataItem : logs) {
      String message = dataItem.affectedRecord != null
        ? JSON.serialize(dataItem.affectedRecord)
        : dataItem.message;
      String loggingLevel = dataItem.loggingLevel;
      String className =
        dataItem.className +
        '-' +
        dataItem.affectedObjectAPIName;
      String affectedId = dataItem.affectedId;
      logger.log(message, className, affectedId, loggingLevel);
    }
  }

  /**
   * Encapsulates data for declaratively raising log events
   */
  public class AppLogData {
    @InvocableVariable(Label='Message' Description='Message to be logged')
    public String message;

    @InvocableVariable(Label='Logging Level' Description='Level to Log')
    public String loggingLevel;

    @InvocableVariable(Label='Flow Name' Description='Name of Flow')
    public String className;

    @InvocableVariable(Label='Object Id' Description='Id of object')
    public String affectedId;
    @InvocableVariable(Label='Object API Name' Description='Name of object')
    public String affectedObjectAPIName;
    @InvocableVariable(Label='Record Instance' Description='Record Data')
    public sObject affectedRecord;
  }
}
